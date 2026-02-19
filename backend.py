import os
from dotenv import load_dotenv
from pyairtable import Api

# Load secure tokens
load_dotenv()
TOKEN = os.getenv("AIRTABLE_TOKEN")
BASE_ID = os.getenv("AIRTABLE_BASE_ID")
TABLE_NAME = os.getenv("AIRTABLE_TABLE_NAME")

# Initialize connection
api = Api(TOKEN)
table = api.table(BASE_ID, "Apps")

def print_table_contents():
    try:
        # Fetch all records
        records = table.all()

        if not records:
            print("The table is empty.")
            return
        else:
            print(records)



    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    print_table_contents()