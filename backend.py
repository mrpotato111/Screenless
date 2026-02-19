import os
from dotenv import load_dotenv
from pyairtable import Api

load_dotenv()
TOKEN = os.getenv("AIRTABLE_TOKEN")
BASE_ID = os.getenv("AIRTABLE_BASE_ID")
TABLE_NAME = os.getenv("AIRTABLE_TABLE_NAME")

api = Api(TOKEN)
table = api.table(BASE_ID, "Users")

def get_limit_value(record_id, field_name):
    try:
        record = table.get(record_id)
        print(record['fields'].get(field_name, {}))
    except Exception:
        print("6h 00m") # Fallback default

if __name__ == "__main__":
    # Example ID
    get_limit_value("recMHKiRmlCeF90kX", "Screen_time_limit")
