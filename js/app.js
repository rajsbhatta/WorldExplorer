/* ============================================================
   World Explorer — App Router & Bootstrap  (js/app.js)
   ============================================================ */

import { loadAllCountries, flagUrl } from './api.js';
import { initCountriesPage }         from './countries.js';
import { initDetailPage }            from './detail.js';
import { initComparePage }           from './compare.js';
import { initGamesPage }             from './games.js';
import { initSettingsPage, loadPrefs } from './settings.js';
import { initMePage }                from './me.js';

/* ── State ───────────────────────────────────────────────────── */
export const AppState = {
  countries:   [],
  homeCountry: null,
  currentPage: 'home',
  _listeners:  {},
};

export function on(event, fn) {
  if (!AppState._listeners[event]) AppState._listeners[event] = [];
  AppState._listeners[event].push(fn);
}
function emit(event, data) {
  (AppState._listeners[event] || []).forEach(fn => fn(data));
}

/* ── Local storage ───────────────────────────────────────────── */
const LS_HOME = 'worldex:home';

export function saveHomeCountry(country) {
  AppState.homeCountry = country;
  localStorage.setItem(LS_HOME, JSON.stringify({
    cca2: country.cca2, name: country.name, latlng: country.latlng,
  }));
  emit('homeChanged', country);
  renderHomeWidget();
}

function loadHomeCountry() {
  try {
    const raw = localStorage.getItem(LS_HOME);
    if (raw) AppState.homeCountry = JSON.parse(raw);
  } catch {}
}

/* ── Service Worker ──────────────────────────────────────────── */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller)
          showToast('Update available — refresh to get the latest.', 'info');
      });
    });
  } catch (e) { console.warn('[SW]', e); }
}

/* ── Router ──────────────────────────────────────────────────── */
const PAGES = ['home', 'countries', 'compare', 'games', 'settings', 'me'];

export function navigate(pageId, params = {}) {
  if (pageId === 'detail') { showDetailView(params.cca2); return; }

  PAGES.forEach(id => {
    document.getElementById(`page-${id}`)?.classList.toggle('active', id === pageId);
  });
  document.getElementById('page-detail')?.classList.remove('active');

  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.page === pageId)
  );

  AppState.currentPage = pageId;
  history.replaceState(null, '', `#${pageId}`);

  if (pageId === 'countries') initCountriesPage();
  if (pageId === 'compare')   initComparePage();
  if (pageId === 'games')     initGamesPage();
  if (pageId === 'settings')  initSettingsPage();
  if (pageId === 'me')        initMePage();

  window.scrollTo({ top: 0, behavior: 'instant' });
}

function showDetailView(cca2) {
  PAGES.forEach(id => document.getElementById(`page-${id}`)?.classList.remove('active'));
  document.getElementById('page-detail')?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  AppState.currentPage = 'detail';
  history.replaceState(null, '', `#detail/${cca2}`);
  initDetailPage(cca2);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ── Nav ─────────────────────────────────────────────────────── */
function bindNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
}

/* ── Home widget ─────────────────────────────────────────────── */
function renderHomeWidget() {
  const wrap = document.getElementById('home-country-widget');
  if (!wrap) return;
  const hc = AppState.homeCountry;
  if (!hc) {
    wrap.innerHTML = `
      <button class="btn btn-ghost btn-icon" id="pick-home-btn" title="Set home country">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </button>`;
  } else {
    wrap.innerHTML = `
      <button class="home-widget-btn" id="pick-home-btn" title="Change home country">
        <img src="${flagUrl(hc)}" alt="${hc.name}" width="28" height="19"
             style="border-radius:3px;object-fit:cover;flex-shrink:0;">
        <span style="font-family:var(--font-display);font-weight:700;font-size:0.78rem;
                     color:var(--text-secondary);white-space:nowrap;overflow:hidden;
                     text-overflow:ellipsis;max-width:80px;">${hc.name}</span>
      </button>`;
  }
  document.getElementById('pick-home-btn')?.addEventListener('click', openHomePicker);
}

/* ── Home page ───────────────────────────────────────────────── */
function renderHomePage() {
  const hc      = AppState.homeCountry;
  const total   = AppState.countries.length;
  const regions = [...new Set(AppState.countries.map(c => c.region))].length;
  const langs   = [...new Set(AppState.countries.flatMap(c => c.languages))].length;

  const strip = document.getElementById('home-stats-strip');
  if (strip) {
    strip.querySelector('[data-stat="countries"]').textContent = total;
    strip.querySelector('[data-stat="regions"]').textContent   = regions;
    strip.querySelector('[data-stat="languages"]').textContent = langs + '+';
  }

  const hero = document.getElementById('home-hero-section');
  if (!hero) return;

  if (!hc) {
    hero.innerHTML = `
      <div class="home-hero">
        <div class="home-greeting">Welcome</div>
        <div class="home-title">Your world <span>awaits</span></div>
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:var(--sp-4);line-height:1.6;">
          Set your home country to unlock distance comparisons and insights.
        </p>
        <button class="btn btn-primary" id="home-pick-btn">🏠&nbsp; Set Home Country</button>
      </div>`;
    document.getElementById('home-pick-btn')?.addEventListener('click', openHomePicker);
  } else {
    hero.innerHTML = `
      <div class="home-hero">
        <div class="home-greeting">Your Home Country</div>
        <div class="home-country-selector" id="home-pick-btn" role="button" tabindex="0">
          <img class="home-country-flag" src="${flagUrl(hc)}" alt="${hc.name}">
          <div>
            <div class="home-country-name">${hc.name}</div>
            <div class="home-country-hint">Tap to change</div>
          </div>
          <span class="home-country-change">Change ›</span>
        </div>
      </div>`;
    document.getElementById('home-pick-btn')?.addEventListener('click', openHomePicker);
  }
}

/* ── Home country picker ─────────────────────────────────────── */
let pickerCountries = [];

export function openHomePicker() {
  const modal = document.getElementById('home-picker-modal');
  if (!modal) return;
  modal.classList.add('open');
  renderPickerList('');
  setTimeout(() => document.getElementById('picker-search')?.focus(), 300);
}

function closeHomePicker() {
  document.getElementById('home-picker-modal')?.classList.remove('open');
}

function renderPickerList(query) {
  const list = document.getElementById('picker-list');
  if (!list) return;
  const q        = query.toLowerCase();
  const filtered = q
    ? pickerCountries.filter(c =>
        c.name.toLowerCase().includes(q) || c.capital.toLowerCase().includes(q))
    : pickerCountries;

  list.innerHTML = filtered.slice(0, 120).map(c => `
    <button class="picker-item ${AppState.homeCountry?.cca2 === c.cca2 ? 'selected' : ''}"
            data-cca2="${c.cca2}">
      <img class="picker-flag" src="${flagUrl(c)}" alt="${c.name}" loading="lazy" width="36" height="24">
      <span class="picker-name">${c.name}</span>
      <span class="picker-check">✓</span>
    </button>`).join('');

  list.querySelectorAll('.picker-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const country = AppState.countries.find(c => c.cca2 === btn.dataset.cca2);
      if (country) {
        saveHomeCountry(country);
        closeHomePicker();
        showToast(`🏠 Home set to ${country.name}`, 'success');
        renderHomePage();
      }
    });
  });
}

/* ── Toast ───────────────────────────────────────────────────── */
export function showToast(message, type = 'info', durationMs = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-size:1rem;flex-shrink:0;">${icons[type]||'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateY(-4px)';
    toast.style.transition = 'all 250ms ease';
    setTimeout(() => toast.remove(), 260);
  }, durationMs);
}

/* ── Install prompt ──────────────────────────────────────────── */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-btn')?.classList.remove('hidden');
});

export function triggerInstall() {
  if (!deferredInstallPrompt) {
    showToast('Install prompt not available — try from browser menu', 'info');
    return;
  }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') showToast('World Explorer installed! 🎉', 'success');
    deferredInstallPrompt = null;
    document.getElementById('install-btn')?.classList.add('hidden');
  });
}

/* ── Boot ────────────────────────────────────────────────────── */
async function boot() {
  loadPrefs();      /* apply saved theme immediately */
  registerSW();
  loadHomeCountry();
  bindNav();

  document.getElementById('home-picker-modal')
    ?.addEventListener('click', e => { if (e.target === e.currentTarget) closeHomePicker(); });
  document.getElementById('picker-close-btn')?.addEventListener('click', closeHomePicker);
  document.getElementById('picker-search')?.addEventListener('input', e => renderPickerList(e.target.value));
  document.getElementById('install-btn')?.addEventListener('click', triggerInstall);

  const hero = document.getElementById('home-hero-section');
  if (hero) hero.innerHTML = `<div class="loading-center"><div class="spinner"></div><span>Loading country data…</span></div>`;

  try {
    AppState.countries = await loadAllCountries();
    pickerCountries    = AppState.countries;

    if (AppState.homeCountry?.cca2) {
      const full = AppState.countries.find(c => c.cca2 === AppState.homeCountry.cca2);
      if (full) AppState.homeCountry = full;
    }

    renderHomePage();
    renderHomeWidget();
    window.__hideSplash?.();

    const hash = location.hash.replace('#', '');
    if (hash.startsWith('detail/'))      showDetailView(hash.replace('detail/', ''));
    else if (PAGES.includes(hash))       navigate(hash);
    else                                 navigate('home');

  } catch (err) {
    console.error('[Boot]', err);
    window.__hideSplash?.();
    if (hero) hero.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Could not load country data.<br>Check your connection and retry.</p>
        <p style="font-size:0.72rem;color:var(--text-muted);margin-top:8px;">${err?.message||''}</p>
        <button class="btn btn-primary mt-4" onclick="location.reload()">Retry</button>
      </div>`;
    showToast('Failed to load data — tap Retry', 'error', 6000);
  }
}

window.__navigate = navigate;
document.addEventListener('DOMContentLoaded', boot);

/* Register WX shim so queued onclick calls flush */
if (window.WX?._register) {
  window.WX._register({ go: navigate });
}
