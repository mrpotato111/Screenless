import os
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from pyairtable import Api

load_dotenv()

app = Flask(__name__)
CORS(app)

# Config
AIRTABLE_API_KEY = os.getenv("AIRTABLE_TOKEN")
BASE_ID          = os.getenv("AIRTABLE_BASE_ID")
USERS_TABLE      = os.getenv("USERS_TABLE")
APPS_TABLE       = os.getenv("APPS_TABLE_NAME")
USER_RECORD_ID   = os.getenv("USER_RECORD_ID")

APP_LIMITS_TABLE  = os.getenv("APP_LIMITS_TABLE",  "App_limits")
APP_USETIME_TABLE = os.getenv("APP_USETIME_TABLE", "App_usetime")
ACTIVITIES_TABLE  = os.getenv("ACTIVITIES_TABLE",  "Activities")

api_client        = Api(AIRTABLE_API_KEY)
main_table        = api_client.table(BASE_ID, USERS_TABLE)
apps_table        = api_client.table(BASE_ID, APPS_TABLE)
app_limits_table  = api_client.table(BASE_ID, APP_LIMITS_TABLE)
app_usetime_table = api_client.table(BASE_ID, APP_USETIME_TABLE)
activities_table  = api_client.table(BASE_ID, ACTIVITIES_TABLE)

HEADERS = {"Authorization": f"Bearer {AIRTABLE_API_KEY}"}


def build_usetime_map():
    usetime_map = {}
    try:
        for rec in app_usetime_table.all():
            f = rec.get('fields', {})
            if USER_RECORD_ID in f.get('User', []):
                for aid in f.get('Apps', []):
                    usetime_map[aid] = f.get('Time', '')
    except Exception as e:
        print(f"Could not fetch App_usetime: {e}")
    return usetime_map


@app.route('/api/sync', methods=['GET'])
def sync_data():
    try:
        airtable_response = requests.get(
            f"https://api.airtable.com/v0/{BASE_ID}/{USERS_TABLE}/{USER_RECORD_ID}",
            headers=HEADERS
        )
        data   = airtable_response.json()
        fields = data.get('fields', {})

        limit_map = {}
        try:
            for rec in app_limits_table.all():
                f = rec.get('fields', {})
                if USER_RECORD_ID in f.get('User', []):
                    for aid in f.get('App', []):
                        limit_map[aid] = {
                            "limit":           f.get("Limit", ""),
                            "limit_record_id": rec['id']
                        }
        except Exception as e:
            print(f"Could not fetch App_limits: {e}")

        usetime_map = build_usetime_map()

        def get_app_details(record_ids, include_limits=False):
            if not record_ids:
                return []
            result = []
            for rec_id in record_ids:
                try:
                    app_rec    = apps_table.get(rec_id)
                    app_fields = app_rec.get('fields', {})
                    logo_data  = app_fields.get('Logo', [])
                    logo_url   = logo_data[0].get('url') if logo_data else ""
                    entry = {
                        "id":   rec_id,
                        "name": app_fields.get("Apps", "Unknown"),
                        "logo": logo_url,
                        "time": usetime_map.get(rec_id, app_fields.get("UsageTime", "0m"))
                    }
                    if include_limits:
                        lim = limit_map.get(rec_id, {})
                        entry["limit"]           = lim.get("limit", "")
                        entry["limit_record_id"] = lim.get("limit_record_id", "")
                    result.append(entry)
                except Exception as e:
                    print(f"Skipping app record {rec_id}: {e}")
            return result

        payload = {
            "today_time":   fields.get("Screentime_today",    "0h 00m"),
            "daily_limit":  fields.get("Screen_time_limit",   "0h 00m"),
            "weekly_total": fields.get("Screentime_this_week","0h 00m"),
            "blocked_apps": get_app_details(fields.get("Blocked_apps", [])),
            "limited_apps": get_app_details(fields.get("limited_apps", []), include_limits=True),
            "level":        fields.get("Level", 1),
            "exp":          fields.get("EXP",   0),
        }
        return jsonify(payload)

    except Exception as e:
        print(f"CRASH ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/move-app', methods=['PATCH'])
def move_app():
    try:
        body      = request.get_json()
        app_id    = body.get('app_id')
        direction = body.get('direction')
        if not app_id or direction not in ('to_limited', 'to_blocked'):
            return jsonify({"error": "Invalid payload"}), 400

        user   = main_table.get(USER_RECORD_ID)
        fields = user.get('fields', {})
        blocked = list(fields.get('Blocked_apps', []))
        limited = list(fields.get('limited_apps', []))

        if direction == 'to_limited':
            blocked = [r for r in blocked if r != app_id]
            if app_id not in limited:
                limited.append(app_id)
        else:
            limited = [r for r in limited if r != app_id]
            if app_id not in blocked:
                blocked.append(app_id)

        main_table.update(USER_RECORD_ID, {'Blocked_apps': blocked, 'limited_apps': limited})
        return jsonify({"ok": True})
    except Exception as e:
        print(f"move-app ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/remove-app', methods=['PATCH'])
def remove_app():
    try:
        body   = request.get_json()
        app_id = body.get('app_id')
        if not app_id:
            return jsonify({"error": "No app_id provided"}), 400

        user   = main_table.get(USER_RECORD_ID)
        fields = user.get('fields', {})
        blocked = [r for r in fields.get('Blocked_apps', []) if r != app_id]
        limited = [r for r in fields.get('limited_apps', [])  if r != app_id]
        main_table.update(USER_RECORD_ID, {'Blocked_apps': blocked, 'limited_apps': limited})
        return jsonify({"ok": True})
    except Exception as e:
        print(f"remove-app ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/update-limit', methods=['PATCH'])
def update_limit():
    try:
        body      = request.get_json()
        new_limit = body.get('limit', '').strip()
        if not new_limit:
            return jsonify({"error": "No limit provided"}), 400
        main_table.update(USER_RECORD_ID, {"Screen_time_limit": new_limit})
        return jsonify({"ok": True, "limit": new_limit})
    except Exception as e:
        print(f"update-limit ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/update-xp', methods=['PATCH'])
def update_xp():
    try:
        body      = request.get_json()
        new_level = body.get('level')
        new_exp   = body.get('exp')
        if new_level is None or new_exp is None:
            return jsonify({"error": "Missing level or exp"}), 400

        resp = requests.patch(
            f"https://api.airtable.com/v0/{BASE_ID}/{USERS_TABLE}/{USER_RECORD_ID}",
            headers={**HEADERS, "Content-Type": "application/json"},
            json={"fields": {"Level": str(new_level), "EXP": str(new_exp)}}
        )
        if not resp.ok:
            return jsonify({"error": resp.text}), 500
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/update-app-limit', methods=['PATCH'])
def update_app_limit():
    try:
        body      = request.get_json()
        record_id = body.get('record_id')
        new_limit = body.get('limit', '').strip()
        if not record_id or not new_limit:
            return jsonify({"error": "Invalid payload"}), 400
        app_limits_table.update(record_id, {"Limit": new_limit})
        return jsonify({"ok": True, "limit": new_limit})
    except Exception as e:
        print(f"update-app-limit ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/get-apps', methods=['GET'])
def get_apps():
    try:
        usetime_map = build_usetime_map()
        limit_map   = {}
        try:
            for rec in app_limits_table.all():
                f = rec.get('fields', {})
                if USER_RECORD_ID in f.get('User', []):
                    for aid in f.get('App', []):
                        limit_map[aid] = f.get('Limit', '')
        except Exception as e:
            print(f"Could not fetch App_limits for get-apps: {e}")

        result = []
        for rec in apps_table.all():
            f        = rec.get('fields', {})
            logo_data = f.get('Logo', [])
            logo_url  = logo_data[0].get('url') if logo_data else ""
            result.append({
                "id":    rec['id'],
                "name":  f.get("Apps", "Unknown"),
                "logo":  logo_url,
                "time":  usetime_map.get(rec['id'], f.get("UsageTime", "0m")),
                "limit": limit_map.get(rec['id'], '')
            })
        return jsonify(result)
    except Exception as e:
        print(f"get-apps ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/add-app', methods=['PATCH'])
def add_app():
    try:
        body      = request.get_json()
        app_id    = body.get('app_id')
        list_type = body.get('list_type')
        if not app_id or list_type not in ('blocked', 'limited'):
            return jsonify({"error": "Invalid payload"}), 400

        user   = main_table.get(USER_RECORD_ID)
        fields = user.get('fields', {})
        blocked = list(fields.get('Blocked_apps', []))
        limited = list(fields.get('limited_apps',  []))

        if list_type == 'blocked':
            if app_id not in blocked:
                blocked.append(app_id)
            limited = [r for r in limited if r != app_id]
        else:
            if app_id not in limited:
                limited.append(app_id)
            blocked = [r for r in blocked if r != app_id]

        main_table.update(USER_RECORD_ID, {'Blocked_apps': blocked, 'limited_apps': limited})
        return jsonify({"ok": True})
    except Exception as e:
        print(f"add-app ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/activities', methods=['GET'])
def get_activities():
    try:
        result = []
        for rec in activities_table.all():
            f = rec.get('fields', {})
            result.append({
                "name":     f.get("Name", "Unknown"),
                "length":   f.get("Length", ""),
                "division": f.get("division", ""),
            })
        return jsonify(result)
    except Exception as e:
        print(f"get-activities ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
