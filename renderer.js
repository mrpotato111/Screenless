const { exec } = require('child_process');

function syncLimitFromAirtable() {
    console.log("Starting sync...");

    exec('python backend.py', (error, stdout, stderr) => {
        if (error) {
            // This will show you if Python itself isn't found
            console.error(`Exec Error: ${error.message}`);
            document.getElementById('display-global-limit').innerText = "Error: Python not found";
            return;
        }
        if (stderr) {
            // This will show you if your Python code has a bug or missing library
            console.error(`Python Error: ${stderr}`);
            document.getElementById('display-global-limit').innerText = "Error in script";
            return;
        }

        const newLimit = stdout.trim();
        console.log("Received from Python:", newLimit);

        if (newLimit) {
            document.getElementById('display-global-limit').innerText = newLimit;
        } else {
            document.getElementById('display-global-limit').innerText = "No data received";
        }
    });
}

// Run the sync when the script loads
syncLimitFromAirtable();
