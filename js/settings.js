/* ============================================================
   World Explorer — Settings Page  (js/settings.js)
   Features: theme, distance unit, install, feedback form
   ============================================================ */

import { AppState, triggerInstall, showToast } from './app.js';

const LS_THEME = 'worldex:theme';
const LS_UNIT  = 'worldex:distunit';

/* ── Persisted prefs ─────────────────────────────────────────── */
export function loadPrefs() {
  const theme = localStorage.getItem(LS_THEME) || 'system';
  const unit  = localStorage.getItem(LS_UNIT)  || 'km';
  applyTheme(theme);
  return { theme, unit };
}

export function getDistUnit() {
  return localStorage.getItem(LS_UNIT) || 'km';
}

export function kmToDisplay(km) {
  if (getDistUnit() === 'mi') {
    return { value: Math.round(km * 0.621371).toLocaleString(), unit: 'mi' };
  }
  return { value: km.toLocaleString(), unit: 'km' };
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    /* system */
    const prefersDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
}

function saveTheme(theme) {
  localStorage.setItem(LS_THEME, theme);
  applyTheme(theme);
}

function saveUnit(unit) {
  localStorage.setItem(LS_UNIT, unit);
}

/* ── Init settings page ──────────────────────────────────────── */
let _initialised = false;

export function initSettingsPage() {
  const page = document.getElementById('page-settings');
  if (!page) return;

  const prefs = loadPrefs();

  page.innerHTML = `
    <h2 class="t-heading mb-5" style="font-size:1.25rem;">Settings</h2>

    <!-- ── Appearance ── -->
    <div class="settings-section">
      <div class="settings-section-title">Appearance</div>

      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">🎨</div>
          <div>
            <div class="settings-row-label">Theme</div>
            <div class="settings-row-sub">Choose your preferred colour scheme</div>
          </div>
        </div>
        <div class="seg-control" id="theme-seg">
          <button class="seg-btn ${prefs.theme==='light'  ?'active':''}" data-val="light">☀️ Light</button>
          <button class="seg-btn ${prefs.theme==='system' ?'active':''}" data-val="system">⚙️ Auto</button>
          <button class="seg-btn ${prefs.theme==='dark'   ?'active':''}" data-val="dark">🌙 Dark</button>
        </div>
      </div>
    </div>

    <!-- ── Units ── -->
    <div class="settings-section">
      <div class="settings-section-title">Measurement</div>

      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">📏</div>
          <div>
            <div class="settings-row-label">Distance Unit</div>
            <div class="settings-row-sub">Used in Compare and Distance Duel</div>
          </div>
        </div>
        <div class="seg-control" id="unit-seg">
          <button class="seg-btn ${prefs.unit==='km' ?'active':''}" data-val="km">km</button>
          <button class="seg-btn ${prefs.unit==='mi' ?'active':''}" data-val="mi">miles</button>
        </div>
      </div>
    </div>

    <!-- ── App ── -->
    <div class="settings-section">
      <div class="settings-section-title">App</div>

      <div class="settings-row clickable" id="install-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">📲</div>
          <div>
            <div class="settings-row-label">Install App</div>
            <div class="settings-row-sub" id="install-sub">Add to your home screen for offline use</div>
          </div>
        </div>
        <button class="btn btn-primary" id="settings-install-btn" style="font-size:0.8rem;padding:8px 16px;">
          Install
        </button>
      </div>

      <div class="settings-row clickable" id="clear-cache-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">🗑️</div>
          <div>
            <div class="settings-row-label">Clear Data Cache</div>
            <div class="settings-row-sub">Re-fetch all country data fresh</div>
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>

      <div class="settings-row clickable" id="update-app-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">🔄</div>
          <div>
            <div class="settings-row-label">Check for Updates</div>
            <div class="settings-row-sub">Clear app cache and reload latest version</div>
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>

      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">ℹ️</div>
          <div>
            <div class="settings-row-label">Version</div>
            <div class="settings-row-sub">World Explorer v1.0.0</div>
          </div>
        </div>
        <span style="font-size:0.78rem;color:var(--text-muted);font-family:var(--font-display);font-weight:600;">Free · No Ads</span>
      </div>
    </div>

   <!-- ── About ── -->
    <div class="settings-section">
      <div class="settings-section-title">About This App</div>
      <div class="settings-row">
        <div class="settings-row-left">
          <div style="font-size:.85rem;color:var(--text-secondary);line-height:1.7;">
            World Explorer is a free, offline-capable PWA — political, geographic,
            demographic and economic data on every country. No ads, no server, zero cost.
          </div>
        </div>
      </div>
      <div class="settings-row">
        <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);padding:0 0 var(--sp-2);">
          <span class="org-tag">250+ Countries</span>
          <span class="org-tag">World Bank</span>
          <span class="org-tag">Wikidata</span>
          <span class="org-tag">OpenStreetMap</span>
          <span class="org-tag">Works offline</span>
          <span class="org-tag">No Ads</span>
        </div>
      </div>
    </div>

    <!-- ── Data sources ── -->
    <div class="settings-section">
      <div class="settings-section-title">Data Sources</div>
      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">🌐</div>
          <div>
            <div class="settings-row-label">Country Data</div>
            <div class="settings-row-sub">mledoze/countries · dr5hn dataset</div>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">💰</div>
          <div>
            <div class="settings-row-label">Economic Data</div>
            <div class="settings-row-sub">World Bank Open Data API</div>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">🏛️</div>
          <div>
            <div class="settings-row-label">Political Data</div>
            <div class="settings-row-sub">Wikidata SPARQL endpoint</div>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-icon">🚩</div>
          <div>
            <div class="settings-row-label">Flag Images</div>
            <div class="settings-row-sub">flagcdn.com</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Feedback ── -->
    <div class="settings-section" style="margin-bottom:var(--sp-3);">
      <div class="settings-section-title">Feedback &amp; Bug Reports</div>
      <div style="padding:var(--sp-5);">
        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;margin-bottom:var(--sp-5);">
          Found a bug? Have a suggestion? We'd love to hear from you.
        </p>
        <div class="feedback-form" id="feedback-form">
          <div class="form-field">
            <label class="form-label">Type</label>
            <select class="form-select" id="fb-type">
              <option value="bug">🐛 Bug Report</option>
              <option value="suggestion">💡 Suggestion</option>
              <option value="feedback">💬 General Feedback</option>
              <option value="other">📝 Other</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Your Name <span style="color:var(--text-muted)">(optional)</span></label>
            <input class="form-input" id="fb-name" type="text" placeholder="How should we address you?">
          </div>
          <div class="form-field">
            <label class="form-label">Message</label>
            <textarea class="form-textarea" id="fb-message" placeholder="Describe the issue or share your thoughts…"></textarea>
          </div>
          <button class="btn btn-primary btn-full" id="fb-submit" style="margin-top:var(--sp-2);">
            Send Feedback
          </button>
          <div id="fb-status" style="text-align:center;font-size:0.82rem;color:var(--text-muted);min-height:20px;"></div>
        </div>
      </div>
    </div>

    <p style="text-align:center;font-size:0.72rem;color:var(--text-muted);padding:var(--sp-4) 0 var(--sp-8);">
      World Explorer · Free forever · No ads · No tracking
    </p>
  `;

  _bindSettings();
}

function _bindSettings() {
  /* Theme segmented control */
  document.getElementById('theme-seg')?.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    document.querySelectorAll('#theme-seg .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveTheme(btn.dataset.val);
  });

  /* Unit segmented control */
  document.getElementById('unit-seg')?.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    document.querySelectorAll('#unit-seg .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveUnit(btn.dataset.val);
    showToast(`Distance unit set to ${btn.dataset.val === 'km' ? 'kilometres' : 'miles'}`, 'success');
  });

  /* Install button */
  document.getElementById('settings-install-btn')?.addEventListener('click', () => {
    triggerInstall();
  });

  /* Check if already installed */
  if (window.matchMedia('(display-mode: standalone)').matches) {
    const sub = document.getElementById('install-sub');
    const btn = document.getElementById('settings-install-btn');
    if (sub) sub.textContent = '✓ App is already installed';
    if (btn) { btn.textContent = 'Installed'; btn.disabled = true; btn.style.opacity = '0.5'; }
  }

  /* Clear data cache */
  document.getElementById('clear-cache-row')?.addEventListener('click', async () => {
    const { clearAllCache } = await import('./api.js');
    await clearAllCache();
    showToast('Cache cleared — data will refresh on next load', 'success');
  });

  /* Check for updates — clears SW cache then reloads */
  document.getElementById('update-app-row')?.addEventListener('click', async () => {
    showToast('Checking for updates…', 'info', 1500);
    try {
      /* Tell the service worker to clear its caches */
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const channel = new MessageChannel();
        navigator.serviceWorker.controller.postMessage(
          { type: 'CLEAR_DATA_CACHE' }, [channel.port2]
        );
      }
      /* Also clear all SW caches via the Cache API */
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      /* Clear IndexedDB data cache too */
      const { clearAllCache } = await import('./api.js');
      await clearAllCache();

      showToast('Updated! Reloading…', 'success', 1200);
      setTimeout(() => location.reload(true), 1300);
    } catch(e) {
      showToast('Could not clear cache — try a manual refresh', 'error');
    }
  });

  /* Feedback form */
  document.getElementById('fb-submit')?.addEventListener('click', _submitFeedback);
}

async function _submitFeedback() {
  const type    = document.getElementById('fb-type')?.value    || 'feedback';
  const name    = document.getElementById('fb-name')?.value.trim()    || 'Anonymous';
  const message = document.getElementById('fb-message')?.value.trim() || '';
  const status  = document.getElementById('fb-status');
  const btn     = document.getElementById('fb-submit');

  if (!message) {
    if (status) { status.textContent = 'Please write a message before sending.'; status.style.color = 'var(--coral)'; }
    return;
  }

  /* Disable button while sending */
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  if (status) { status.textContent = ''; }

  const typeLabels = { bug:'Bug Report', suggestion:'Suggestion', feedback:'Feedback', other:'Other' };
  const subject = encodeURIComponent(`[WorldEx] ${typeLabels[type] || type} from ${name}`);
  const body    = encodeURIComponent(
    `Type: ${typeLabels[type] || type}\nFrom: ${name}\n\n${message}\n\n---\nSent from World Explorer PWA`
  );

  /* Use mailto — works without any backend, no email exposed in UI */
  const target = atob('c2F1cmFiaC5hcHBpbHl5b3Vyc0BnbWFpbC5jb20=');
  const link   = document.createElement('a');
  link.href    = `mailto:${target}?subject=${subject}&body=${body}`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  /* Reset form */
  setTimeout(() => {
    if (btn)    { btn.disabled = false; btn.textContent = 'Send Feedback'; }
    if (status) { status.textContent = '✓ Your email client has been opened.'; status.style.color = 'var(--green)'; }
    const msgEl = document.getElementById('fb-message');
    const nameEl = document.getElementById('fb-name');
    if (msgEl)  msgEl.value  = '';
    if (nameEl) nameEl.value = '';
  }, 600);
}
