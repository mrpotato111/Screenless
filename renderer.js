const { exec } = require('child_process');
const path = require('path'); // Add this line

function syncLimitFromAirtable() {
    const scriptPath = path.join(__dirname, 'backend.py');

    exec(`python "${scriptPath}"`, (error, stdout, stderr) => {
        if (error || stderr) {
            console.error("Sync Error:", error || stderr);
            return;
        }

        try {
            const data = JSON.parse(stdout);
            console.log("Data received:", data);

            // 1. Update Daily Limit - String(data.daily_limit) prevents 'undefined'
            const limitEl = document.getElementById('display-global-limit');
            if (limitEl) {
                limitEl.innerText = data.daily_limit || "0h 00m";
            }

            // 2. Build Blocked Apps (passing the array directly)
            buildList('blocked-apps-container', data.blocked_apps, '🚫');

            // 3. Build Limited Apps
            buildList('limited-apps-container', data.limited_apps, '🕒');

        } catch (e) {
            console.error("Parsing Error:", e);
        }
    });
}

function buildList(containerId, appsArray, defaultIcon) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // IMPORTANT: Check if the array is empty or "None"
    if (!appsArray || appsArray.length === 0 || appsArray === "None") {
        container.innerHTML = '<p class="sub-text" style="margin-left:20px;">No apps restricted</p>';
        return;
    }

    appsArray.forEach(app => {
        // Create the image tag if a logo URL exists
        const iconHtml = app.logo
            ? `<img src="${app.logo}" style="width:22px; height:22px; border-radius:4px; margin-right:10px; vertical-align:middle;">`
            : `<span class="icon-green" style="margin-right:10px;">${defaultIcon}</span>`;

        container.innerHTML += `
            <div class="card limit-item">
                <div class="card-left">
                    ${iconHtml}
                    <span class="label-text">${app.name}</span>
                </div>
                <span class="icon-red">${defaultIcon === '🚫' ? '🔒' : '🕒'}</span>
            </div>`;
    });
}

// Make it global so the HTML button can find it
window.syncLimitFromAirtable = syncLimitFromAirtable;

// Run automatically on load
document.addEventListener('DOMContentLoaded', syncLimitFromAirtable);