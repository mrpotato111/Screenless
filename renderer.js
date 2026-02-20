const { exec } = require('child_process');
const path = require('path'); // Add this line

function syncLimitFromAirtable() {
    const scriptPath = path.join(__dirname, 'backend.py');

    exec(`python "${scriptPath}"`, (error, stdout, stderr) => {
        if (error || stderr) return;

        try {
            const data = JSON.parse(stdout);

            const todayEl = document.getElementById('hub-daily-total-display');
            if (todayEl) {
                todayEl.innerText = data.today_time;
            }

            // 1. Update Daily Limit (Home/Limits screens)
            const limitEl = document.getElementById('display-global-limit');
            if (limitEl) limitEl.innerText = data.daily_limit;

            // 2. Update Weekly Total (Apps screen) - NEW LOGIC
            const weeklyEl = document.getElementById('weekly-total-display');
            if (weeklyEl) {
                weeklyEl.innerText = data.weekly_total || "0h 00m";
            }


            // 3. Build App Lists (as before)
            buildList('blocked-apps-container', data.blocked_apps, '🚫');
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