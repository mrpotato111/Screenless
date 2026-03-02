import os
import requests
from flask import Flask, jsonify
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

if __name__ == '__main__':
    app.run(port=5000)