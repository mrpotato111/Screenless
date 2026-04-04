import os
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from pyairtable import Table,Api


load_dotenv()

app = Flask(__name__)
CORS(app) # This is essential for the browser to allow the connection

# Config
AIRTABLE_API_KEY = os.getenv("AIRTABLE_TOKEN")
BASE_ID = os.getenv("AIRTABLE_BASE_ID")
USERS_TABLE = os.getenv("USERS_TABLE")
APPS_TABLE = os.getenv("APPS_TABLE_NAME")
USER_RECORD_ID = os.getenv("USER_RECORD_ID")
api = Api(AIRTABLE_API_KEY)

HEADERS = {"Authorization": f"Bearer {AIRTABLE_API_KEY}"}

APP_LIMITS_TABLE = os.getenv("APP_LIMITS_TABLE", "App_limits")
APP_USETIME_TABLE = os.getenv("APP_USETIME_TABLE", "App_usetime")

main_table = api.table(BASE_ID, USERS_TABLE)
apps_table = api.table(BASE_ID, APPS_TABLE)
app_limits_table = api.table(BASE_ID, APP_LIMITS_TABLE)
app_usetime_table = api.table(BASE_ID, APP_USETIME_TABLE)


def build_usetime_map():
    """Return a dict of app_record_id -> time string for the current user."""
    usetime_map = {}
    try:
        records = app_usetime_table.all()
        for rec in records:
            f = rec.get('fields', {})
            if USER_RECORD_ID in f.get('User', []):
                for aid in f.get('Apps', []):
                    usetime_map[aid] = f.get('Time', '')
    except Exception as e:
        print(f"Could not fetch App_usetime: {e}")
    return usetime_map

@app.route('/sync', methods=['GET'])
def sync_data():
    try:

        # 1. Get the raw response from Airtable
        airtable_response = requests.get(
            f"https://api.airtable.com/v0/{BASE_ID}/{USERS_TABLE}/{USER_RECORD_ID}",
            headers=HEADERS
        )

        # 2. Convert that response into a Python Dictionary immediately]
        data = airtable_response.json()
        fields = data.get('fields', {})


        # 3. Fetch App_limits and App_usetime for this user
        limit_map = {}  # app_record_id -> {limit, limit_record_id}
        try:
            limit_records = app_limits_table.all()
            for rec in limit_records:
                f = rec.get('fields', {})
                if USER_RECORD_ID in f.get('User', []):
                    for aid in f.get('App', []):
                        limit_map[aid] = {
                            "limit": f.get("Limit", ""),
                            "limit_record_id": rec['id']
                        }
        except Exception as e:
            print(f"Could not fetch App_limits: {e}")

        usetime_map = build_usetime_map()

        # 4. Define the formatter
        def get_app_details(record_ids, include_limits=False):
            if not record_ids:
                return []

            detailed_list = []
            for rec_id in record_ids:
                try:
                    app_rec = apps_table.get(rec_id)
                    app_fields = app_rec.get('fields', {})

                    logo_data = app_fields.get('Logo', [])
                    logo_url = logo_data[0].get('url') if logo_data else ""

                    entry = {
                        "id":   rec_id,
                        "name": app_fields.get("Apps", "Unknown"),
                        "logo": logo_url,
                        "time": usetime_map.get(rec_id, app_fields.get("UsageTime", "0m"))
                    }
                    if include_limits:
                        lim = limit_map.get(rec_id, {})
                        entry["limit"] = lim.get("limit", "")
                        entry["limit_record_id"] = lim.get("limit_record_id", "")
                    detailed_list.append(entry)
                except Exception as e:
                    print(f"Skipping app record {rec_id}: {e}")
                    continue
            return detailed_list

        # 5. Create a plain Python dictionary (The Payload)
        payload = {
            "today_time": fields.get("Screentime_today", "0h 00m"),
            "daily_limit": fields.get("Screen_time_limit", "0h 00m"),
            "weekly_total": fields.get("Screentime_this_week", "0h 00m"),
            "blocked_apps": get_app_details(fields.get("Blocked_apps", [])),
            "limited_apps": get_app_details(fields.get("limited_apps", []), include_limits=True)
        }

        # 6. Print the payload (not the response object) for debugging
        print(f"Sending to Electron: {payload}")

        # 7. Send it back as JSON
        return jsonify(payload)

    except Exception as e:
        print(f"CRASH ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/move-app', methods=['PATCH'])
def move_app():
    """Move an app record from one list (blocked/limited) to the other."""
    try:
        body       = request.get_json()
        app_id     = body.get('app_id')
        direction  = body.get('direction')  # 'to_limited' or 'to_blocked'
        if not app_id or direction not in ('to_limited', 'to_blocked'):
            return jsonify({"error": "Invalid payload"}), 400

        user = main_table.get(USER_RECORD_ID)
        fields = user.get('fields', {})

        blocked = list(fields.get('Blocked_apps', []))
        limited = list(fields.get('limited_apps', []))

        if direction == 'to_limited':
            blocked = [r for r in blocked if r != app_id]
            if app_id not in limited:
                limited.append(app_id)
        else:  # to_blocked
            limited = [r for r in limited if r != app_id]
            if app_id not in blocked:
                blocked.append(app_id)

        main_table.update(USER_RECORD_ID, {
            'Blocked_apps': blocked,
            'limited_apps': limited
        })
        return jsonify({"ok": True})
    except Exception as e:
        print(f"move-app ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/remove-app', methods=['PATCH'])
def remove_app():
    """Remove an app record from both blocked and limited lists."""
    try:
        body   = request.get_json()
        app_id = body.get('app_id')
        if not app_id:
            return jsonify({"error": "No app_id provided"}), 400

        user = main_table.get(USER_RECORD_ID)
        fields = user.get('fields', {})

        blocked = [r for r in fields.get('Blocked_apps', []) if r != app_id]
        limited = [r for r in fields.get('limited_apps', [])  if r != app_id]

        main_table.update(USER_RECORD_ID, {
            'Blocked_apps': blocked,
            'limited_apps': limited
        })
        return jsonify({"ok": True})
    except Exception as e:
        print(f"remove-app ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/update-limit', methods=['PATCH'])
def update_limit():
    try:
        body = request.get_json()
        new_limit = body.get('limit', '').strip()
        if not new_limit:
            return jsonify({"error": "No limit provided"}), 400

        main_table.update(USER_RECORD_ID, {"Screen_time_limit": new_limit})
        return jsonify({"ok": True, "limit": new_limit})
    except Exception as e:
        print(f"update-limit ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/update-app-limit', methods=['PATCH'])
def update_app_limit():
    try:
        body = request.get_json()
        record_id = body.get('record_id')
        new_limit = body.get('limit', '').strip()
        if not record_id or not new_limit:
            return jsonify({"error": "Invalid payload"}), 400
        app_limits_table.update(record_id, {"Limit": new_limit})
        return jsonify({"ok": True, "limit": new_limit})
    except Exception as e:
        print(f"update-app-limit ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/get-apps', methods=['GET'])
def get_apps():
    """Return all apps from the Apps table with usetime from App_usetime."""
    try:
        usetime_map = build_usetime_map()
        records = apps_table.all()
        result = []
        for rec in records:
            f = rec.get('fields', {})
            logo_data = f.get('Logo', [])
            logo_url = logo_data[0].get('url') if logo_data else ""
            result.append({
                "id":   rec['id'],
                "name": f.get("Apps", "Unknown"),
                "logo": logo_url,
                "time": usetime_map.get(rec['id'], f.get("UsageTime", "0m"))
            })
        return jsonify(result)
    except Exception as e:
        print(f"get-apps ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/add-app', methods=['PATCH'])
def add_app():
    """Add an app to either blocked or limited list."""
    try:
        body      = request.get_json()
        app_id    = body.get('app_id')
        list_type = body.get('list_type')  # 'blocked' or 'limited'
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

        main_table.update(USER_RECORD_ID, {
            'Blocked_apps': blocked,
            'limited_apps': limited
        })
        return jsonify({"ok": True})
    except Exception as e:
        print(f"add-app ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(port=5000, debug=False)