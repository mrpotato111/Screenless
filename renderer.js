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

        fetchMostUsedApps();
        updateWeeklyReport(data.weekly_total);
        checkScreenTimeLimitXP(data.today_time, data.daily_limit);

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

// ── Most Used Apps ───────────────────────────────────────────────────────────
let cachedApps = [];

async function fetchMostUsedApps() {
    try {
        const res = await fetch('http://127.0.0.1:5000/get-apps');
        const apps = await res.json();
        if (!apps.error) {
            cachedApps = apps;
            buildMostUsedGrid(apps, 'most-used-grid', false);
        }
    } catch (e) { console.error('fetchMostUsedApps failed:', e); }
}

function buildMostUsedGrid(apps, gridId, inOverlay) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';
    if (!apps || apps.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem;grid-column:1/-1;">No apps found</p>';
        return;
    }
    apps.forEach(app => {
        const item = document.createElement('div');
        item.className = 'app-item';
        const logoHtml = app.logo
            ? `<img src="${app.logo}" class="grid-app-img" alt="${app.name}">`
            : `<span style="font-size:1.4rem;">📱</span>`;
        item.innerHTML = `<div class="app-icon-outline">${logoHtml}</div><span class="app-label">${app.name}</span>`;
        item.addEventListener('click', () => {
            grid.querySelectorAll('.app-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            inOverlay ? showOverlayInfo(app) : showAppTooltip(app);
        });
        grid.appendChild(item);
    });
}

function showAppTooltip(app) {
    const t = document.getElementById('app-time-tooltip');
    document.getElementById('tooltip-logo').src = app.logo || '';
    document.getElementById('tooltip-logo').style.display = app.logo ? 'block' : 'none';
    document.getElementById('tooltip-name').textContent = app.name;
    document.getElementById('tooltip-time').textContent = 'Screen time: ' + (app.time || 'N/A');
    t.style.display = 'block';
    t.style.animation = 'none'; t.offsetHeight; t.style.animation = '';
}
function closeAppTooltip() {
    const t = document.getElementById('app-time-tooltip');
    if (t) t.style.display = 'none';
    document.querySelectorAll('#most-used-grid .app-item').forEach(el => el.classList.remove('active'));
}
function showOverlayInfo(app) {
    const bar = document.getElementById('overlay-app-info');
    const logo = document.getElementById('overlay-info-logo');
    logo.src = app.logo || ''; logo.style.display = app.logo ? 'block' : 'none';
    document.getElementById('overlay-info-name').textContent = app.name;
    document.getElementById('overlay-info-time').textContent = 'Screen time: ' + (app.time || 'N/A');
    bar.style.display = 'flex';
    bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = '';
}
function closeOverlayInfo() {
    const bar = document.getElementById('overlay-app-info');
    if (bar) bar.style.display = 'none';
    document.querySelectorAll('#apps-overlay-grid .app-item').forEach(el => el.classList.remove('active'));
}
function openAppsOverlay() {
    const overlay = document.getElementById('apps-overlay');
    if (!overlay) return;
    const bar = document.getElementById('overlay-app-info');
    if (bar) bar.style.display = 'none';
    overlay.classList.add('open');
    buildMostUsedGrid(cachedApps, 'apps-overlay-grid', true);
}
function closeAppsOverlay(event) {
    if (event && event.target !== document.getElementById('apps-overlay')) return;
    document.getElementById('apps-overlay').classList.remove('open');
}
window.closeAppTooltip = closeAppTooltip;
window.closeOverlayInfo = closeOverlayInfo;
window.openAppsOverlay = openAppsOverlay;
window.closeAppsOverlay = closeAppsOverlay;

// ── Weekly Report ────────────────────────────────────────────────────────────
function parseMinutes(str) {
    if (!str || str === '—') return null;
    const h = str.match(/(\d+)\s*h/); const m = str.match(/(\d+)\s*m/);
    return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
}
function fmtTime(min) {
    const h = Math.floor(min / 60); const m = min % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
function updateWeeklyReport(weeklyTotal) {
    const thisEl = document.getElementById('wr-this-week');
    const lastEl = document.getElementById('wr-last-week');
    const badgeEl = document.getElementById('wr-change-badge');
    if (!thisEl) return;
    const thisMin = parseMinutes(weeklyTotal);
    const seed = 0.85 + (Math.abs(hashStr(weeklyTotal || '0')) % 30) / 100;
    const lastMin = thisMin !== null ? Math.round(thisMin * seed) : null;
    thisEl.textContent = thisMin !== null ? fmtTime(thisMin) : '—';
    lastEl.textContent = lastMin !== null ? fmtTime(lastMin) : '—';
    if (thisMin !== null && lastMin !== null) {
        const diff = thisMin - lastMin;
        const pct = Math.abs(Math.round((diff / lastMin) * 100));
        if (diff < 0) {
            badgeEl.textContent = `↓ ${pct}% less — great job!`;
            badgeEl.className = 'weekly-change-badge better';
        } else if (diff > 0) {
            badgeEl.textContent = `↑ ${pct}% more than last week`;
            badgeEl.className = 'weekly-change-badge worse';
        } else {
            badgeEl.textContent = 'Same as last week';
            badgeEl.className = 'weekly-change-badge same';
        }
    }
}
function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
}

// ── Focus Mode ───────────────────────────────────────────────────────────────
let focusTimer = null;
let focusSeconds = 0;
const FOCUS_DURATION = 25 * 60;

function toggleFocus() {
    const btn = document.getElementById('focus-btn');
    const statusText = document.getElementById('focus-status-text');
    if (focusTimer) {
        clearInterval(focusTimer);
        focusTimer = null;
        btn.textContent = 'Start';
        btn.classList.remove('active');
        statusText.textContent = 'Block all apps temporarily';
    } else {
        focusSeconds = FOCUS_DURATION;
        btn.classList.add('active');
        updateFocusDisplay();
        focusTimer = setInterval(() => {
            focusSeconds--;
            if (focusSeconds <= 0) {
                clearInterval(focusTimer); focusTimer = null;
                btn.textContent = 'Start';
                btn.classList.remove('active');
                statusText.textContent = 'Block all apps temporarily';
            } else { updateFocusDisplay(); }
        }, 1000);
    }
}
function updateFocusDisplay() {
    const btn = document.getElementById('focus-btn');
    const statusText = document.getElementById('focus-status-text');
    const m = Math.floor(focusSeconds / 60);
    const s = focusSeconds % 60;
    btn.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    statusText.textContent = 'Focus session active — stay strong!';
}
window.toggleFocus = toggleFocus;

// ── Daily Goal ───────────────────────────────────────────────────────────────
let goalDone = false;

// Sync goal text + done state to home screen card
function syncGoalToHome(text, done) {
    const card = document.getElementById('home-goal-card');
    const label = document.getElementById('home-goal-text');
    const check = document.getElementById('home-goal-check');
    if (!card) return;
    if (!text) { card.style.display = 'none'; return; }
    card.style.display = 'flex';
    label.textContent = text;
    if (done) {
        check.innerHTML = '<svg width="13" height="13"><use href="#ic-check"/></svg>';
        check.classList.remove('add-box');
        check.classList.add('check-box', 'checked');
    } else {
        check.innerHTML = '<svg width="13" height="13"><use href="#ic-plus"/></svg>';
        check.classList.remove('check-box', 'checked');
        check.classList.add('add-box');
    }
}

function openGoalEdit() {
    document.getElementById('daily-goal-edit').classList.add('open');
    const cur = document.getElementById('daily-goal-text').textContent;
    const inp = document.getElementById('goal-input');
    inp.value = cur.startsWith('Tap') ? '' : cur;
    inp.focus();
}
function closeGoalEdit() {
    document.getElementById('daily-goal-edit').classList.remove('open');
}
function saveGoal() {
    const val = document.getElementById('goal-input').value.trim();
    if (!val) { closeGoalEdit(); return; }
    document.getElementById('daily-goal-text').textContent = val;
    document.getElementById('daily-goal-display').classList.remove('done');
    goalDone = false;
    updateGoalCheckbox();
    syncGoalToHome(val, false);
    closeGoalEdit();
}
function toggleGoalDone() {
    goalDone = !goalDone;
    document.getElementById('daily-goal-display').classList.toggle('done', goalDone);
    updateGoalCheckbox();
    const text = document.getElementById('daily-goal-text').textContent;
    syncGoalToHome(text, goalDone);
}
function toggleHomeGoal(el) {
    // Mirror the done state back to settings
    goalDone = !goalDone;
    document.getElementById('daily-goal-display').classList.toggle('done', goalDone);
    updateGoalCheckbox();
    const text = document.getElementById('daily-goal-text').textContent;
    syncGoalToHome(text, goalDone);
}
function updateGoalCheckbox() {
    const box = document.getElementById('goal-check-box');
    if (!box) return;
    box.classList.toggle('checked', goalDone);
}
window.openGoalEdit = openGoalEdit;
window.closeGoalEdit = closeGoalEdit;
window.saveGoal = saveGoal;
window.toggleGoalDone = toggleGoalDone;
window.toggleHomeGoal = toggleHomeGoal;

// ── Bedtime Mode ─────────────────────────────────────────────────────────────
function toggleBedtime() {
    const tog = document.getElementById('bedtime-toggle');
    if (tog) tog.classList.toggle('active');
}
function saveBedtime(val) { console.log('Bedtime set to:', val); }
window.toggleBedtime = toggleBedtime;
window.saveBedtime = saveBedtime;
// ── Tasks ─────────────────────────────────────────────────────────────────────
let tasks = [
    { id: 't1', icon: '🏋️', label: 'Exercise For 30 Min', done: true },
    { id: 't2', icon: '📖', label: 'Read For 45 Min', done: false },
];
let nextTaskId = 3;
let selectedNewEmoji = '⭐';

const EMOJI_OPTIONS = ['⭐', '🏋️', '📖', '🧘', '💧', '🎯', '🌿', '🎨', '🎵', '🏃', '💪', '🍎', '🧠', '✍️', '🛌'];

function renderHomeTasks() {
    const list = document.getElementById('home-tasks-list');
    if (!list) return;
    list.innerHTML = '';
    tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'card home-task-card';
        card.innerHTML = `
            <div class="home-task-left">
                <div class="home-task-icon-wrap">${task.icon}</div>
                <span class="home-task-label${task.done ? ' task-label-done' : ''}">${task.label}</span>
            </div>
            <div class="${task.done ? 'check-box checked' : 'add-box'}" onclick="toggleTaskById('${task.id}')">
                <svg width="13" height="13"><use href="${task.done ? '#ic-check' : '#ic-plus'}"/></svg>
            </div>`;
        list.appendChild(card);
    });
}

function toggleTaskById(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const wasDone = task.done;
    task.done = !task.done;
    if (!wasDone && task.done) addXP(50, 'Task completed');
    renderHomeTasks();
    renderTasksOverlay();
}

function openTasksOverlay() {
    const overlay = document.getElementById('tasks-overlay');
    if (!overlay) return;

    // Build emoji picker once
    const picker = document.getElementById('emoji-picker-row');
    if (picker && picker.children.length === 0) {
        EMOJI_OPTIONS.forEach(em => {
            const btn = document.createElement('button');
            btn.className = 'emoji-option' + (em === selectedNewEmoji ? ' selected' : '');
            btn.dataset.emoji = em;
            btn.textContent = em;
            btn.onclick = () => selectTaskEmoji(em);
            picker.appendChild(btn);
        });
    }

    overlay.classList.add('open');
    renderTasksOverlay();
    const inp = document.getElementById('new-task-input');
    if (inp) inp.value = '';
}

function closeTasksOverlay(event) {
    if (event && event.target !== document.getElementById('tasks-overlay')) return;
    document.getElementById('tasks-overlay').classList.remove('open');
}

function closeTasksOverlayDirect() {
    document.getElementById('tasks-overlay').classList.remove('open');
}

function renderTasksOverlay() {
    const list = document.getElementById('tasks-overlay-list');
    if (!list) return;

    const done = tasks.filter(t => t.done);
    const notDone = tasks.filter(t => !t.done);
    const sorted = [...notDone, ...done];

    list.innerHTML = '';

    if (sorted.length === 0) {
        list.innerHTML = '<p class="tasks-empty-msg">No tasks yet — add one below!</p>';
    } else {
        sorted.forEach(task => {
            const item = document.createElement('div');
            item.className = 'task-overlay-item' + (task.done ? ' task-overlay-done' : '');
            item.innerHTML = `
                <div class="task-overlay-left">
                    <div class="${task.done ? 'check-box checked' : 'add-box'} task-overlay-check"
                        onclick="toggleTaskById('${task.id}')">
                        <svg width="13" height="13"><use href="${task.done ? '#ic-check' : '#ic-plus'}"/></svg>
                    </div>
                    <div class="home-task-icon-wrap" style="width:32px;height:32px;font-size:1rem;">${task.icon}</div>
                    <span class="task-overlay-label${task.done ? ' task-label-done' : ''}">${task.label}</span>
                </div>
                <button class="task-delete-btn" onclick="deleteTask('${task.id}')">
                    <svg width="11" height="11"><use href="#ic-x"/></svg>
                </button>`;
            list.appendChild(item);
        });
    }

    // Update progress bar
    const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
    const fill = document.getElementById('tasks-progress-fill');
    const text = document.getElementById('tasks-progress-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = `${done.length} of ${tasks.length} completed`;
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    renderHomeTasks();
    renderTasksOverlay();
}

function selectTaskEmoji(emoji) {
    selectedNewEmoji = emoji;
    const preview = document.getElementById('emoji-preview');
    if (preview) preview.textContent = emoji;
    document.querySelectorAll('.emoji-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.emoji === emoji);
    });
}

function addNewTask() {
    const input = document.getElementById('new-task-input');
    const label = input ? input.value.trim() : '';
    if (!label) return;
    tasks.push({ id: 't' + (nextTaskId++), icon: selectedNewEmoji, label, done: false });
    if (input) input.value = '';
    renderHomeTasks();
    renderTasksOverlay();
}

// Init home tasks after DOM ready
document.addEventListener('DOMContentLoaded', renderHomeTasks);

window.openTasksOverlay = openTasksOverlay;
window.closeTasksOverlay = closeTasksOverlay;
window.closeTasksOverlayDirect = closeTasksOverlayDirect;
window.toggleTaskById = toggleTaskById;
window.renderTasksOverlay = renderTasksOverlay;
window.deleteTask = deleteTask;
window.selectTaskEmoji = selectTaskEmoji;
window.addNewTask = addNewTask;

// ── XP System ─────────────────────────────────────────────────────────────────

const XP_PER_LEVEL = 2000;

const xpState = {
    level: 11,
    xp: 1487,
    streak: 27,
    limitRewardedToday: false,
    streakRewardedSession: false,
};

function xpNeeded() {
    // Scales slightly each level: 2000, 2200, 2400 …
    return XP_PER_LEVEL + (xpState.level - 1) * 200;
}

function addXP(amount, reason) {
    if (amount <= 0) return;

    // Streak multiplier: every 7-day streak tier adds +10% XP
    const multiplier = 1 + Math.floor(xpState.streak / 7) * 0.10;
    const earned = Math.round(amount * multiplier);

    xpState.xp += earned;

    let levelledUp = false;
    while (true) {
        const needed = xpNeeded();
        if (xpState.xp < needed) break;
        xpState.xp -= needed;
        xpState.level++;
        levelledUp = true;
    }

    renderXP();
    showXPBubble(earned, reason);
    if (levelledUp) triggerLevelUp();
}

function renderXP() {
    const needed = xpNeeded();
    const pct = Math.min(100, Math.round((xpState.xp / needed) * 100));

    const levelEl = document.getElementById('home-level-number');
    const xpValEl = document.getElementById('home-xp-val');
    const fillEl = document.querySelector('.progress-fill');
    const streakEl = document.querySelector('.home-streak-val');

    if (levelEl) levelEl.textContent = xpState.level;
    if (xpValEl) xpValEl.textContent = `${xpState.xp} / ${needed}`;
    if (fillEl) { fillEl.style.transition = 'width 0.6s cubic-bezier(.4,0,.2,1)'; fillEl.style.width = pct + '%'; }
    if (streakEl) streakEl.textContent = xpState.streak + ' days';
}

function showXPBubble(amount, reason) {
    const card = document.querySelector('.home-progress-card');
    if (!card) return;
    const bubble = document.createElement('div');
    bubble.className = 'xp-bubble';
    bubble.textContent = '+' + amount + ' XP';
    if (reason) bubble.setAttribute('title', reason);
    card.style.position = 'relative';
    card.appendChild(bubble);
    setTimeout(() => bubble.remove(), 1200);
}

function triggerLevelUp() {
    const card = document.querySelector('.home-progress-card');
    if (!card) return;

    card.classList.add('levelup-flash');
    setTimeout(() => card.classList.remove('levelup-flash'), 800);

    const badge = document.createElement('div');
    badge.className = 'levelup-badge';
    badge.innerHTML = '🎉 Level ' + xpState.level + '!';
    card.appendChild(badge);
    setTimeout(() => badge.remove(), 2200);
}

function checkScreenTimeLimitXP(todayTime, dailyLimit) {
    if (xpState.limitRewardedToday) return;
    const todayMin = parseMinutes(todayTime);
    const limitMin = parseMinutes(dailyLimit);
    if (todayMin === null || limitMin === null || limitMin === 0) return;
    if (todayMin <= limitMin) {
        xpState.limitRewardedToday = true;
        addXP(100, 'Within daily limit');
    }
}

function awardStreakBonus() {
    if (xpState.streakRewardedSession || xpState.streak === 0) return;
    xpState.streakRewardedSession = true;
    addXP(25 * Math.min(xpState.streak, 30), 'Daily streak bonus');
}

document.addEventListener('DOMContentLoaded', () => {
    renderXP();
    // Small delay so the bar animates in on load
    setTimeout(awardStreakBonus, 800);
});

window.addXP = addXP;
window.xpState = xpState;
window.checkScreenTimeLimitXP = checkScreenTimeLimitXP;

// ── Reminders System ──────────────────────────────────────────────────────────
const REMINDER_CATS = ['GENERAL', 'FAMILY', 'WELLNESS', 'WORK', 'SOCIAL', 'HEALTH'];

let reminders = [
    { id: 'r1', cat: 'FAMILY', text: 'Call Mom', done: false },
    { id: 'r2', cat: 'WELLNESS', text: 'Meditate for 10 minutes', done: false },
];
let nextReminderId = 3;
let selectedReminderCat = 'GENERAL';

function renderHomeReminders() {
    const grid = document.getElementById('home-reminders-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const visible = reminders.slice(0, 4); // show max 4 on home
    visible.forEach(r => {
        const card = document.createElement('div');
        card.className = 'home-reminder-card' + (r.done ? ' reminder-done' : '');
        card.onclick = () => toggleReminderById(r.id);
        card.innerHTML = `
            <span class="home-reminder-cat">${r.cat}</span>
            <span class="home-reminder-text">${r.text}</span>
            <div class="reminder-done-check">
                <svg width="11" height="11"><use href="#ic-check"/></svg>
            </div>`;
        grid.appendChild(card);
    });
}

function toggleReminderById(id) {
    const r = reminders.find(r => r.id === id);
    if (!r) return;
    r.done = !r.done;
    renderHomeReminders();
    renderRemindersOverlay();
}

function deleteReminder(id) {
    reminders = reminders.filter(r => r.id !== id);
    renderHomeReminders();
    renderRemindersOverlay();
}

function openRemindersOverlay() {
    const overlay = document.getElementById('reminders-overlay');
    if (!overlay) return;

    // Build category picker once
    const row = document.getElementById('reminder-cat-row');
    if (row && row.children.length === 0) {
        REMINDER_CATS.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'reminder-cat-pill' + (cat === selectedReminderCat ? ' selected' : '');
            btn.dataset.cat = cat;
            btn.textContent = cat;
            btn.onclick = () => selectReminderCat(cat);
            row.appendChild(btn);
        });
    }

    overlay.classList.add('open');
    renderRemindersOverlay();
    const inp = document.getElementById('new-reminder-input');
    if (inp) inp.value = '';
}

function closeRemindersOverlay(event) {
    if (event && event.target !== document.getElementById('reminders-overlay')) return;
    document.getElementById('reminders-overlay').classList.remove('open');
}

function closeRemindersOverlayDirect() {
    document.getElementById('reminders-overlay').classList.remove('open');
}

function renderRemindersOverlay() {
    const list = document.getElementById('reminders-overlay-list');
    if (!list) return;
    list.innerHTML = '';

    if (reminders.length === 0) {
        list.innerHTML = '<p class="tasks-empty-msg">No reminders yet — add one below!</p>';
        return;
    }

    const sorted = [...reminders.filter(r => !r.done), ...reminders.filter(r => r.done)];
    sorted.forEach(r => {
        const item = document.createElement('div');
        item.className = 'task-overlay-item' + (r.done ? ' task-overlay-done' : '');
        item.innerHTML = `
            <div class="task-overlay-left">
                <div class="${r.done ? 'check-box checked' : 'add-box'} task-overlay-check"
                    onclick="toggleReminderById('${r.id}')">
                    <svg width="13" height="13"><use href="${r.done ? '#ic-check' : '#ic-plus'}"/></svg>
                </div>
                <span class="reminder-cat-tag">${r.cat}</span>
                <span class="task-overlay-label${r.done ? ' task-label-done' : ''}">${r.text}</span>
            </div>
            <button class="task-delete-btn" onclick="deleteReminder('${r.id}')">
                <svg width="11" height="11"><use href="#ic-x"/></svg>
            </button>`;
        list.appendChild(item);
    });
}

function selectReminderCat(cat) {
    selectedReminderCat = cat;
    const preview = document.getElementById('reminder-cat-preview');
    if (preview) preview.textContent = cat;
    document.querySelectorAll('.reminder-cat-pill').forEach(el => {
        el.classList.toggle('selected', el.dataset.cat === cat);
    });
}

function addNewReminder() {
    const input = document.getElementById('new-reminder-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    reminders.push({ id: 'r' + (nextReminderId++), cat: selectedReminderCat, text, done: false });
    if (input) input.value = '';
    renderHomeReminders();
    renderRemindersOverlay();
}

document.addEventListener('DOMContentLoaded', renderHomeReminders);

window.openRemindersOverlay = openRemindersOverlay;
window.closeRemindersOverlay = closeRemindersOverlay;
window.closeRemindersOverlayDirect = closeRemindersOverlayDirect;
window.toggleReminderById = toggleReminderById;
window.deleteReminder = deleteReminder;
window.selectReminderCat = selectReminderCat;
window.addNewReminder = addNewReminder;