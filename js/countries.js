/* ============================================================
   World Explorer — Countries List Page  (js/countries.js)
   Features: virtual-scroll-friendly grid, search, region
   filter, sort, favourite toggle
   ============================================================ */

import { AppState, navigate, showToast } from './app.js';
import { flagUrl, fmtNumber, REGIONS, getAllStamps } from './api.js';

/* ── State ───────────────────────────────────────────────────── */
let _initialised = false;
let _query       = '';
let _region      = 'All';
let _sort        = 'name';       /* name | population | area */
let _page        = 0;
const PAGE_SIZE  = 48;           /* cards per batch */
let _filtered    = [];
let _observer    = null;         /* IntersectionObserver for infinite scroll */
let _favourites  = new Set();

/* ── Entry point ─────────────────────────────────────────────── */
export function initCountriesPage() {
  if (_initialised) {
    /* Already built — just refresh if needed */
    _applyFilters();
    return;
  }
  _initialised = true;

  _loadFavourites();
  _buildUI();
  _bindEvents();
  _applyFilters();
}

/* ── Build static UI shell ───────────────────────────────────── */
function _buildUI() {
  const page = document.getElementById('page-countries');
  if (!page) return;

  page.innerHTML = `
    <!-- Search -->
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input id="countries-search" class="search-input" type="search"
             placeholder="Search countries, capitals…" autocomplete="off" spellcheck="false">
      <button class="search-clear" id="countries-search-clear" aria-label="Clear search">✕</button>
    </div>

    <!-- Region filter pills -->
    <div class="filter-bar" id="region-filter" role="group" aria-label="Filter by region">
      ${REGIONS.map(r => `
        <button class="filter-pill ${r === 'All' ? 'active' : ''}" data-region="${r}">${r}</button>
      `).join('')}
    </div>

    <!-- Sort + count row -->
    <div class="flex items-center justify-between mb-4" style="gap:var(--sp-3);flex-wrap:wrap;">
      <span id="countries-count" class="t-label" style="color:var(--text-muted);">— countries</span>
      <div class="flex gap-2">
        <button class="filter-pill active" data-sort="name"       id="sort-name">A–Z</button>
        <button class="filter-pill"        data-sort="population" id="sort-pop">Population</button>
        <button class="filter-pill"        data-sort="area"       id="sort-area">Area</button>
      </div>
    </div>

    <!-- Grid -->
    <div id="countries-grid" role="list" aria-label="Country list"></div>

    <!-- Load more sentinel -->
    <div id="load-sentinel" style="height:40px;"></div>

    <!-- Loading indicator -->
    <div id="countries-loading" class="loading-center hidden">
      <div class="spinner"></div>
    </div>
  `;
}

/* ── Bind events ─────────────────────────────────────────────── */
function _bindEvents() {
  /* Search */
  const searchEl = document.getElementById('countries-search');
  searchEl?.addEventListener('input', e => {
    _query = e.target.value.trim();
    _page  = 0;
    _applyFilters();
  });

  document.getElementById('countries-search-clear')
    ?.addEventListener('click', () => {
      const el = document.getElementById('countries-search');
      if (el) el.value = '';
      _query = '';
      _page  = 0;
      _applyFilters();
    });

  /* Region pills */
  document.getElementById('region-filter')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      _region = btn.dataset.region;
      _page   = 0;
      document.querySelectorAll('#region-filter .filter-pill').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
      _applyFilters();
    });

  /* Sort buttons */
  ['name','population','area'].forEach(s => {
    document.getElementById(`sort-${s === 'name' ? 'name' : s === 'population' ? 'pop' : 'area'}`)
      ?.addEventListener('click', function() {
        _sort = s;
        _page = 0;
        document.querySelectorAll('[data-sort]').forEach(b =>
          b.classList.toggle('active', b.dataset.sort === s)
        );
        _applyFilters();
      });
  });

  /* Infinite scroll */
  _observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) _loadMore();
  }, { rootMargin: '200px' });

  const sentinel = document.getElementById('load-sentinel');
  if (sentinel) _observer.observe(sentinel);
}

/* ── Filter + sort ───────────────────────────────────────────── */
function _applyFilters() {
  let list = AppState.countries;

  /* Region */
  if (_region !== 'All') {
    list = list.filter(c => c.region === _region || c.continents.includes(_region));
  }

  /* Search */
  if (_query) {
    const q = _query.toLowerCase();
    list = list.filter(c =>
      c.name.toLowerCase().includes(q)         ||
      c.officialName.toLowerCase().includes(q) ||
      c.capital.toLowerCase().includes(q)      ||
      c.cca2.toLowerCase() === q               ||
      c.cca3.toLowerCase() === q
    );
  }

  /* Sort */
  list = [...list].sort((a, b) => {
    if (_sort === 'population') return b.population - a.population;
    if (_sort === 'area')       return b.area - a.area;
    return a.name.localeCompare(b.name);
  });

  _filtered = list;

  /* Count label */
  const countEl = document.getElementById('countries-count');
  if (countEl) {
    countEl.textContent = `${list.length} ${list.length === 1 ? 'country' : 'countries'}`;
  }

  /* Render first page */
  _renderPage(0);
}

/* ── Render a page of cards ──────────────────────────────────── */
function _renderPage(pageNum) {
  const grid = document.getElementById('countries-grid');
  if (!grid) return;

  const start = pageNum * PAGE_SIZE;
  const slice = _filtered.slice(start, start + PAGE_SIZE);

  if (pageNum === 0) {
    if (slice.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">🔍</div>
          <p>No countries match "<strong>${_query}</strong>"</p>
        </div>`;
      return;
    }
    grid.innerHTML = slice.map(_cardHTML).join('');
  } else {
    slice.forEach(c => {
      const div = document.createElement('div');
      div.innerHTML = _cardHTML(c);
      grid.appendChild(div.firstElementChild);
    });
  }

  _page = pageNum;
  _bindCardEvents(grid, pageNum === 0 ? 0 : start);
}

function _loadMore() {
  const nextPage = _page + 1;
  const start    = nextPage * PAGE_SIZE;
  if (start >= _filtered.length) return;
  _renderPage(nextPage);
}

/* ── Card HTML ───────────────────────────────────────────────── */
function _cardHTML(country) {
  const isHome  = AppState.homeCountry?.cca2 === country.cca2;
  const isFav   = _favourites.has(country.cca2);
  const stamps   = getAllStamps();
  const rawStamp = stamps[country.cca2];
  const stamp    = rawStamp
    ? (typeof rawStamp === 'string' ? { type: rawStamp, year: null } : rawStamp)
    : null;
  const pop      = fmtNumber(country.population);
  const flag     = flagUrl(country);

  const stampBadge = stamp?.type === 'visited'
    ? `<div class="card-stamp-badge visited">✈️ Visited${stamp.year ? ' ' + stamp.year : ''}</div>`
    : stamp?.type === 'wishlist'
      ? `<div class="card-stamp-badge wishlist">⭐ Wish List</div>`
      : stamp?.type === 'citizen'
        ? `<div class="card-stamp-badge citizen">🛂 Citizen</div>`
        : '';
   
  return `
    <article class="country-card" role="listitem" data-cca2="${country.cca2}"
             tabindex="0" aria-label="${country.name}">
      ${isHome ? '<div class="card-home-badge">🏠 Home</div>' : ''}
      <div style="position:relative;">
         <img class="card-flag" src="${flag}" alt="Flag of ${country.name}" loading="lazy"
             width="320" height="180">
         ${stampBadge}
      </div>
      <div class="card-body">
        <div class="card-name">${country.name}</div>
        <div class="card-capital">${country.capital}</div>
        <div class="flex items-center justify-between mt-2" style="gap:4px;">
          <span class="card-pop">👥 ${pop}</span>
          <button class="fav-btn" data-cca2="${country.cca2}"
                  title="${isFav ? 'Remove favourite' : 'Add favourite'}"
                  style="background:none;border:none;font-size:14px;cursor:pointer;
                         opacity:${isFav ? '1' : '0.3'};transition:opacity 150ms ease;
                         padding:2px 4px;">★</button>
        </div>
      </div>
    </article>`;
}

/* ── Bind card click + favourite events ─────────────────────── */
function _bindCardEvents(grid, startIdx) {
  const cards = grid.querySelectorAll(`.country-card:nth-child(n+${startIdx + 1})`);

  grid.querySelectorAll('.country-card').forEach(card => {
    /* Remove old listeners by cloning trick isn't great; use delegation */
  });

  /* Use event delegation on grid (works for all pages) */
  if (!grid._delegated) {
    grid._delegated = true;

    grid.addEventListener('click', e => {
      /* Favourite star */
      const favBtn = e.target.closest('.fav-btn');
      if (favBtn) {
        e.stopPropagation();
        _toggleFavourite(favBtn.dataset.cca2, favBtn);
        return;
      }
      /* Card click → detail */
      const card = e.target.closest('.country-card');
      if (card) navigate('detail', { cca2: card.dataset.cca2 });
    });

    grid.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.country-card');
        if (card) { e.preventDefault(); navigate('detail', { cca2: card.dataset.cca2 }); }
      }
    });
  }
}

/* ── Favourites ──────────────────────────────────────────────── */
const LS_FAVS = 'worldex:favourites';

function _loadFavourites() {
  try {
    const raw = localStorage.getItem(LS_FAVS);
    if (raw) _favourites = new Set(JSON.parse(raw));
  } catch { _favourites = new Set(); }
}

function _saveFavourites() {
  localStorage.setItem(LS_FAVS, JSON.stringify([..._favourites]));
}

function _toggleFavourite(cca2, btn) {
  if (_favourites.has(cca2)) {
    _favourites.delete(cca2);
    if (btn) btn.style.opacity = '0.3';
    showToast('Removed from favourites', 'info', 2000);
  } else {
    _favourites.add(cca2);
    if (btn) btn.style.opacity = '1';
    showToast('★ Added to favourites', 'success', 2000);
  }
  _saveFavourites();
}

/* ── Public: get favourites list ─────────────────────────────── */
export function getFavouriteCountries() {
  return AppState.countries.filter(c => _favourites.has(c.cca2));
}
