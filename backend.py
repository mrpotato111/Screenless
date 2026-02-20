import os
import json
from dotenv import load_dotenv
from pyairtable import Api

load_dotenv()

api = Api(os.getenv("AIRTABLE_TOKEN"))
# We need access to the table where the App names are stored (e.g., "Apps")
main_table = api.table(os.getenv("AIRTABLE_BASE_ID"), os.getenv("AIRTABLE_TABLE_NAME"))
apps_table = api.table(os.getenv("AIRTABLE_BASE_ID"), "Apps") # Change "Apps" to your actual app list table name

def get_app_info(id_list):
    if not id_list or not isinstance(id_list, list):
        return []

    apps_info = []
    for record_id in id_list:
        try:
            app_record = apps_table.get(record_id)
            fields = app_record.get('fields', {})

            # --- THE FIX IS HERE ---
            raw_name = fields.get('Apps', 'Unknown')

            # If Airtable returns the name inside a list (e.g., ['Instagram'])
            # we take the first item. If it's already a string, we just use it.
            if isinstance(raw_name, list):
                clean_name = str(raw_name[0]) if raw_name else "Unknown"
            else:
                clean_name = str(raw_name)

            # Get Logo
            logo_attachments = fields.get('Logo', [])
            logo_url = ""
            if logo_attachments and isinstance(logo_attachments, list):
                logo_url = logo_attachments[0].get('url', "")

            apps_info.append({
                "name": clean_name,
                "logo": logo_url
            })
        except Exception as e:
            print(f"Error fetching app {record_id}: {e}")
            continue
    return apps_info

def get_sync_data(record_id):
    try:
        record = main_table.get(record_id)
        fields = record.get('fields', {})

        # 1. Fetch data and resolve IDs to info (Names + Logos)
        blocked_info = get_app_info(fields.get('Blocked_apps', []))
        limited_info = get_app_info(fields.get('limited_apps', []))

        # 2. Package it up
        data = {
            # Use .get with a default string to avoid 'undefined'
            "daily_limit": str(fields.get('Screen_time_limit', {})),
            "blocked_apps": blocked_info, # This is now a LIST of DICTS
            "limited_apps": limited_info  # This is now a LIST of DICTS
        }

        print(json.dumps(data))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    get_sync_data("recMHKiRmlCeF90kX")