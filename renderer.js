// Remove const { exec } = require('child_process'); - No longer needed!

async function syncLimitFromAirtable() {
    try {
        const response = await fetch('http://127.0.0.1:5000/sync');
        const data = await response.json();

        // If the server sent an error, stop here
        if (data.error) {
            console.error("Server reported an error:", data.error);
            return;
        }

        console.log("Clean data received:", data);

        // Update elements with fallback values if data is missing
        const todayEl = document.getElementById('hub-daily-total-display');
        if (todayEl) todayEl.innerText = data.today_time || "0h 00m";

        const limitEl = document.getElementById('display-global-limit');
        if (limitEl) limitEl.innerText = data.daily_limit || "0h 00m";

        const weeklyEl = document.getElementById('weekly-total-display');
        if (weeklyEl) weeklyEl.innerText = data.weekly_total || "0h 00m";

        buildList('blocked-apps-container', data.blocked_apps || [], '🚫');
        buildList('limited-apps-container', data.limited_apps || [], '🕒');

    } catch (e) {
        console.error("Fetch failed entirely:", e);
    }
}

// Keep your buildList function exactly as it was
function buildList(containerId, appsArray, defaultIcon) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!appsArray || appsArray.length === 0 || appsArray === "None") {
        container.innerHTML = '<p class="sub-text" style="margin-left:20px;">No apps restricted</p>';
        return;
    }

    appsArray.forEach(app => {
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

window.syncLimitFromAirtable = syncLimitFromAirtable;
document.addEventListener('DOMContentLoaded', syncLimitFromAirtable);