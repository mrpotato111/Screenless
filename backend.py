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
    """Takes a list of record IDs and returns list of dicts with name and logo."""
    if not id_list or not isinstance(id_list, list):
        return []

    apps_info = []
    for record_id in id_list:
        try:
            app_record = apps_table.get(record_id)
            fields = app_record.get('fields', {})

            # 1. Get the Name
            name = fields.get('Name', {})

            # 2. Get the Logo URL (Assuming field name is 'Logo')
            logo_attachments = fields.get('Logo', [])
            logo_url = ""
            if logo_attachments and isinstance(logo_attachments, list):
                # Get the 'url' from the first attachment
                logo_url = logo_attachments[0].get('url', "")

            apps_info.append({"name": name, "logo": logo_url})
        except:
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