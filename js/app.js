/* ============================================================
   World Explorer — App Router & Bootstrap  (js/app.js)
   ============================================================ */

import { loadAllCountries, flagUrl } from './api.js';
import { initCountriesPage }         from './countries.js';
import { initDetailPage }            from './detail.js';
import { initComparePage }           from './compare.js';
import { initGamesPage }             from './games.js';

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

/* ── Local-storage helpers ───────────────────────────────────── */
const LS_HOME = 'worldex:home';

export function saveHomeCountry(country) {
  AppState.homeCountry = country;
  localStorage.setItem(LS_HOME, JSON.stringify({
    cca2:    country.cca2,
    name:    country.name,
    flagPng: country.flagPng,
    latlng:  country.latlng,
  }));
  emit('homeChanged', country);
  renderHomeWidget();
}

function loadHomeCountry() {
  try {
    const raw = localStorage.getItem(LS_HOME);
    if (raw) AppState.homeCountry = JSON.parse(raw);
  } catch { /* ignore */ }
}

/* ── Service Worker ──────────────────────────────────────────── */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('Update available — refresh to get the latest.', 'info');
        }
      });
    });
  } catch (err) {
    console.warn('[SW] Registration failed:', err);
  }
}

/* ── Router ──────────────────────────────────────────────────── */
const PAGES = ['home', 'countries', 'compare', 'games'];

export function navigate(pageId, params = {}) {
  if (pageId === 'detail') {
    showDetailView(params.cca2);
    return;
  }

  /* Activate correct page div */
  PAGES.forEach(id => {
    const el = document.getElementById(`page-${id}`);
    if (el) el.classList.toggle('active', id === pageId);
  });
  /* Also hide detail page if navigating away */
  document.getElementById('page-detail')?.classList.remove('active');

  /* Update nav highlight */
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.page === pageId)
  );

  AppState.currentPage = pageId;
  history.replaceState(null, '', `#${pageId}`);

  /* Lazy-init */
  if (pageId === 'countries') initCountriesPage();
  if (pageId === 'compare')   initComparePage();
  if (pageId === 'games')     initGamesPage();

  window.scrollTo({ top: 0, behavior: 'instant' });
}

function showDetailView(cca2) {
  PAGES.forEach(id =>
    document.getElementById(`page-${id}`)?.classList.remove('active')
  );
  const detail = document.getElementById('page-detail');
  if (detail) detail.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.classList.remove('active')
  );

  AppState.currentPage = 'detail';
  history.replaceState(null, '', `#detail/${cca2}`);
  initDetailPage(cca2);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ── Bottom Nav ──────────────────────────────────────────────── */
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
      <button class="btn btn-ghost btn-icon" id="pick-home-btn"
              title="Set home country" aria-label="Set home country">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </button>`;
  } else {
    wrap.innerHTML = `
      <button class="home-widget-btn" id="pick-home-btn" title="Change home country">
        <img src="${hc.flagPng}" alt="${hc.name}" width="28" height="19"
             style="border-radius:3px;object-fit:cover;flex-shrink:0;">
        <span style="font-family:var(--font-display);font-weight:700;font-size:0.78rem;
                     color:var(--text-secondary);white-space:nowrap;overflow:hidden;
                     text-overflow:ellipsis;max-width:80px;">${hc.name}</span>
      </button>`;
  }
  document.getElementById('pick-home-btn')
    ?.addEventListener('click', openHomePicker);
}

/* ── Home page ───────────────────────────────────────────────── */
function renderHomePage() {
  const hc      = AppState.homeCountry;
  const total   = AppState.countries.length;
  const regions = [...new Set(AppState.countries.map(c => c.region))].length;
  const langs   = [...new Set(AppState.countries.flatMap(c => c.languages))].length;

  /* Stats strip */
  const strip = document.getElementById('home-stats-strip');
  if (strip) {
    strip.querySelector('[data-stat="countries"]').textContent = total;
    strip.querySelector('[data-stat="regions"]').textContent   = regions;
    strip.querySelector('[data-stat="languages"]').textContent = langs + '+';
  }

  /* Hero section */
  const heroSection = document.getElementById('home-hero-section');
  if (!heroSection) return;

  if (!hc) {
    heroSection.innerHTML = `
      <div class="home-hero">
        <div class="home-greeting">Welcome</div>
        <div class="home-title">Your world <span>awaits</span></div>
        <p style="color:var(--text-secondary);font-size:0.9rem;
                  margin-bottom:var(--sp-4);line-height:1.6;">
          Set your home country to unlock distance comparisons and insights.
        </p>
        <button class="btn btn-primary" id="home-pick-btn">
          🏠&nbsp; Set Home Country
        </button>
      </div>`;
    document.getElementById('home-pick-btn')
      ?.addEventListener('click', openHomePicker);
  } else {
    heroSection.innerHTML = `
      <div class="home-hero">
        <div class="home-greeting">Your Home Country</div>
        <div class="home-country-selector" id="home-pick-btn" role="button" tabindex="0">
          <img class="home-country-flag" src="${hc.flagPng}" alt="${hc.name}">
          <div>
            <div class="home-country-name">${hc.name}</div>
            <div class="home-country-hint">Tap to change</div>
          </div>
          <span class="home-country-change">Change ›</span>
        </div>
      </div>`;
    document.getElementById('home-pick-btn')
      ?.addEventListener('click', openHomePicker);
  }
}

/* ── Home Country Picker ─────────────────────────────────────── */
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
        c.name.toLowerCase().includes(q) ||
        c.capital.toLowerCase().includes(q)
      )
    : pickerCountries;

  list.innerHTML = filtered.slice(0, 120).map(c => `
    <button class="picker-item ${AppState.homeCountry?.cca2 === c.cca2 ? 'selected' : ''}"
            data-cca2="${c.cca2}">
      <img class="picker-flag" src="${flagUrl(c, 'w80')}" alt="${c.name}"
           loading="lazy" width="36" height="24">
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
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="font-size:1rem;flex-shrink:0;">${icons[type] || 'ℹ'}</span>
    <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateY(-4px)';
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
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') showToast('World Explorer installed!', 'success');
    deferredInstallPrompt = null;
    document.getElementById('install-btn')?.classList.add('hidden');
  });
}

/* ── Bootstrap ───────────────────────────────────────────────── */
async function boot() {
  registerSW();
  loadHomeCountry();
  bindNav();

  /* Modal bindings */
  document.getElementById('home-picker-modal')
    ?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeHomePicker();
    });
  document.getElementById('picker-close-btn')
    ?.addEventListener('click', closeHomePicker);
  document.getElementById('picker-search')
    ?.addEventListener('input', e => renderPickerList(e.target.value));
  document.getElementById('install-btn')
    ?.addEventListener('click', triggerInstall);

  /* Show spinner in hero while loading */
  const heroSection = document.getElementById('home-hero-section');
  if (heroSection) {
    heroSection.innerHTML = `
      <div class="loading-center">
        <div class="spinner"></div>
        <span>Loading country data…</span>
      </div>`;
  }

  try {
    AppState.countries  = await loadAllCountries();
    pickerCountries     = AppState.countries;

    /* Enrich stored home country with full data */
    if (AppState.homeCountry?.cca2) {
      const full = AppState.countries.find(c => c.cca2 === AppState.homeCountry.cca2);
      if (full) AppState.homeCountry = full;
    }

    /* Render home content */
    renderHomePage();
    renderHomeWidget();

    /* Hide splash AFTER content is ready */
    window.__hideSplash?.();

    /* Deep link handling */
    const hash = location.hash.replace('#', '');
    if (hash.startsWith('detail/')) {
      showDetailView(hash.replace('detail/', ''));
    } else if (PAGES.includes(hash)) {
      navigate(hash);
    } else {
      navigate('home');
    }

  } catch (err) {
    console.error('[Boot] Failed:', err);
    window.__hideSplash?.();   /* hide splash even on error */

    if (heroSection) {
      heroSection.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p>Could not load country data.<br>Check your connection and retry.</p>
          <button class="btn btn-primary mt-4" onclick="location.reload()">
            Retry
          </button>
        </div>`;
    }
    showToast('Failed to load data. Are you offline?', 'error', 5000);
  }
}

/* Expose navigate for non-module quick-link cards */
window.__navigate = navigate;

document.addEventListener('DOMContentLoaded', boot);
