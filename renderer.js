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

// Build each app as a dropdown card with a Remove button
function buildList(containerId, appsArray, defaultIcon) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!appsArray || appsArray.length === 0 || appsArray === "None") {
        container.innerHTML = '<p class="sub-text" style="margin-left:20px;">No apps restricted</p>';
        return;
    }

    appsArray.forEach(app => {
        container.appendChild(buildCard(app, defaultIcon));
    });
}

// Build a single app card element
function buildCard(app, defaultIcon) {
    const isBlocked = defaultIcon === '🚫';
    const iconHtml = app.logo
        ? `<img src="${app.logo}" style="width:22px; height:22px; border-radius:4px; margin-right:10px; vertical-align:middle;">`
        : `<span class="icon-green" style="margin-right:10px;">${defaultIcon}</span>`;

    const statusIcon = isBlocked ? '🔒' : '🕒';
    const actionLabel = isBlocked ? '🕒 Limit' : '🔒 Block';
    const targetContainer = isBlocked ? 'limited-apps-container' : 'blocked-apps-container';
    const direction = isBlocked ? 'to_limited' : 'to_blocked';
    const targetIcon = isBlocked ? '🕒' : '🚫';

    const details = document.createElement('details');
    details.className = 'card limit-item limit-dropdown';
    details.dataset.app = JSON.stringify(app);
    details.dataset.icon = defaultIcon;

    details.innerHTML = `
        <summary class="limit-summary">
            <div class="card-left">
                ${iconHtml}
                <span class="label-text">${app.name}</span>
            </div>
            <span class="icon-red limit-status-icon">${statusIcon}</span>
        </summary>
        <div class="limit-dropdown-content">
            <div class="limit-action-row">
                <button class="remove-limit-btn"
                    onclick="removeApp(this)">
                    🗑 Remove
                </button>
                <button class="action-limit-btn"
                    onclick="moveApp(this.closest('details'), '${targetContainer}', '${targetIcon}', '${direction}')">
                    ${actionLabel}
                </button>
            </div>
        </div>`;

    return details;
}

// Remove an app — update Airtable then remove the card from the DOM
async function removeApp(btn) {
    const detailsEl = btn.closest('details');
    const app = JSON.parse(detailsEl.dataset.app);

    setCardBusy(detailsEl, true);
    try {
        const res = await fetch('http://127.0.0.1:5000/remove-app', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: app.id })
        });
        const data = await res.json();
        if (data.ok) {
            detailsEl.remove();
        } else {
            console.error('Remove failed:', data.error);
            setCardBusy(detailsEl, false);
        }
    } catch (e) {
        console.error('Remove request failed:', e);
        setCardBusy(detailsEl, false);
    }
}

// Move an app card to the other container — update Airtable first
async function moveApp(detailsEl, targetContainerId, targetIcon, direction) {
    const app = JSON.parse(detailsEl.dataset.app);
    const targetContainer = document.getElementById(targetContainerId);
    if (!targetContainer) return;

    setCardBusy(detailsEl, true);
    try {
        const res = await fetch('http://127.0.0.1:5000/move-app', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: app.id, direction })
        });
        const data = await res.json();
        if (data.ok) {
            // Remove placeholder if present
            const placeholder = targetContainer.querySelector('p');
            if (placeholder) placeholder.remove();
            detailsEl.remove();
            targetContainer.appendChild(buildCard(app, targetIcon));
        } else {
            console.error('Move failed:', data.error);
            setCardBusy(detailsEl, false);
        }
    } catch (e) {
        console.error('Move request failed:', e);
        setCardBusy(detailsEl, false);
    }
}

// Disable / re-enable all buttons inside a card while a request is in-flight
function setCardBusy(detailsEl, busy) {
    detailsEl.querySelectorAll('button').forEach(b => {
        b.disabled = busy;
        b.style.opacity = busy ? '0.5' : '1';
    });
}


// ── Daily limit inline editing ──────────────────────────────────────────────

function openLimitEdit() {
    // Parse current value e.g. "2h 30m" → hours=2, minutes=30
    const current = document.getElementById('display-global-limit').innerText.trim();
    const hMatch = current.match(/(\d+)\s*h/);
    const mMatch = current.match(/(\d+)\s*m/);
    document.getElementById('limit-hours').value = hMatch ? hMatch[1] : 0;
    document.getElementById('limit-minutes').value = mMatch ? mMatch[1] : 0;

    document.getElementById('display-global-limit').style.display = 'none';
    document.getElementById('limit-edit-row').style.display = 'flex';
    document.getElementById('limit-hours').focus();
}

function closeLimitEdit() {
    document.getElementById('limit-edit-row').style.display = 'none';
    document.getElementById('display-global-limit').style.display = '';
}

async function saveDailyLimit() {
    const h = parseInt(document.getElementById('limit-hours').value) || 0;
    const m = parseInt(document.getElementById('limit-minutes').value) || 0;
    const limitStr = `${h}h ${String(m).padStart(2, '0')}m`;

    const saveBtn = document.querySelector('.limit-save-btn');
    saveBtn.textContent = '…';
    saveBtn.disabled = true;

    try {
        const res = await fetch('http://127.0.0.1:5000/update-limit', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: limitStr })
        });
        const data = await res.json();
        if (data.ok) {
            document.getElementById('display-global-limit').innerText = limitStr;
        } else {
            console.error('Save failed:', data.error);
        }
    } catch (e) {
        console.error('Save request failed:', e);
    } finally {
        saveBtn.textContent = '✓';
        saveBtn.disabled = false;
        closeLimitEdit();
    }
}

window.openLimitEdit = openLimitEdit;
window.closeLimitEdit = closeLimitEdit;
window.saveDailyLimit = saveDailyLimit;

// ─────────────────────────────────────────────────────────────────────────────

window.syncLimitFromAirtable = syncLimitFromAirtable;
window.moveApp = moveApp;
document.addEventListener('DOMContentLoaded', syncLimitFromAirtable);


// ── Add App Modal ────────────────────────────────────────────────────────────

let allAppsCache = null; // cache so we don't refetch every open

async function openAddAppModal() {
    const modal = document.getElementById('add-app-modal');
    modal.classList.add('open');

    if (!allAppsCache) {
        await fetchAllApps();
    } else {
        renderModalApps(allAppsCache);
    }
}

function closeAddAppModal(event) {
    // If called from overlay click, only close if clicking the backdrop itself
    if (event && event.target !== document.getElementById('add-app-modal')) return;
    document.getElementById('add-app-modal').classList.remove('open');
}

async function fetchAllApps() {
    const list = document.getElementById('modal-app-list');
    list.innerHTML = '<div class="modal-loading"><span class="spinner"></span> Loading apps…</div>';

    try {
        const res = await fetch('http://127.0.0.1:5000/get-apps');
        const data = await res.json();
        if (data.error) { list.innerHTML = `<p style="padding:20px;color:var(--danger-red);">${data.error}</p>`; return; }
        allAppsCache = data;
        renderModalApps(data);
    } catch (e) {
        list.innerHTML = '<p style="padding:20px;color:var(--danger-red);">Could not connect to server.</p>';
    }
}

function renderModalApps(apps) {
    const list = document.getElementById('modal-app-list');
    list.innerHTML = '';

    if (!apps.length) {
        list.innerHTML = '<p style="padding:20px;color:var(--text-dim);">No apps found.</p>';
        return;
    }

    apps.forEach(app => {
        const row = document.createElement('div');
        row.className = 'modal-app-row';
        row.dataset.appId = app.id;

        const logoHtml = app.logo
            ? `<img src="${app.logo}" class="modal-app-logo" alt="${app.name}">`
            : `<div class="modal-app-logo-placeholder">📱</div>`;

        row.innerHTML = `
            ${logoHtml}
            <div class="modal-app-info">
                <div class="modal-app-name">${app.name}</div>
                <div class="modal-app-time">${app.time}</div>
            </div>
            <div class="modal-actions">
                <button class="modal-btn modal-btn-limit" onclick="addAppFromModal(this, '${app.id}', 'limited')">🕒 Limit</button>
                <button class="modal-btn modal-btn-block" onclick="addAppFromModal(this, '${app.id}', 'blocked')">🚫 Block</button>
            </div>`;

        list.appendChild(row);
    });
}

async function addAppFromModal(btn, appId, listType) {
    const row = btn.closest('.modal-app-row');
    const buttons = row.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; });
    btn.textContent = '…';

    try {
        const res = await fetch('http://127.0.0.1:5000/add-app', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: appId, list_type: listType })
        });
        const data = await res.json();

        if (data.ok) {
            // Mark the relevant button as added; re-enable the other
            buttons.forEach(b => {
                b.disabled = false;
                b.textContent = b === btn
                    ? (listType === 'limited' ? '🕒 Added' : '🚫 Added')
                    : (listType === 'limited' ? '🚫 Block' : '🕒 Limit');
                if (b === btn) {
                    b.classList.remove('modal-btn-limit', 'modal-btn-block');
                    b.classList.add('modal-btn-added');
                    b.disabled = true;
                }
            });

            // Refresh the limits screen lists in background
            syncLimitFromAirtable();
        } else {
            console.error('add-app failed:', data.error);
            btn.textContent = listType === 'limited' ? '🕒 Limit' : '🚫 Block';
            buttons.forEach(b => { b.disabled = false; });
        }
    } catch (e) {
        console.error('add-app request failed:', e);
        btn.textContent = listType === 'limited' ? '🕒 Limit' : '🚫 Block';
        buttons.forEach(b => { b.disabled = false; });
    }
}

window.openAddAppModal = openAddAppModal;
window.closeAddAppModal = closeAddAppModal;