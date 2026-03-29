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

main_table = api.table(BASE_ID, USERS_TABLE)
apps_table = api.table(BASE_ID, APPS_TABLE)

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


        # 3. Define the formatter
        def get_app_details(record_ids):
            if not record_ids:
                return []

            detailed_list = []
            for rec_id in record_ids:
                try:
                    # Fetch the specific app record from the Apps table
                    app_rec = apps_table.get(rec_id)
                    app_fields = app_rec.get('fields', {})

                    # Get Logo URL (handling the Attachment list structure)
                    logo_data = app_fields.get('Logo', [])
                    logo_url = logo_data[0].get('url') if logo_data else ""

                    detailed_list.append({
                        "id":   rec_id,
                        "name": app_fields.get("Apps", "Unknown"),
                        "logo": logo_url,
                        "time": app_fields.get("UsageTime", "0m")
                    })
                except Exception as e:
                    print(f"Skipping app record {rec_id}: {e}")
                    continue
            return detailed_list

        # 4. Create a plain Python dictionary (The Payload)
        payload = {
            "today_time": fields.get("Screentime_today", "0h 00m"),
            "daily_limit": fields.get("Screen_time_limit", "0h 00m"),
            "weekly_total": fields.get("Screentime_this_week", "0h 00m"),
            "blocked_apps": get_app_details(fields.get("Blocked_apps", [])),
            "limited_apps": get_app_details(fields.get("limited_apps", []))
        }

        # 5. Print the payload (not the response object) for debugging
        print(f"Sending to Electron: {payload}")

        # 6. Send it back as JSON
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

@app.route('/get-apps', methods=['GET'])
def get_apps():
    """Return all apps from the Apps table."""
    try:
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
                "time": f.get("UsageTime", "0m")
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