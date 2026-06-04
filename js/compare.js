/* ============================================================
   World Explorer — Compare Page  (js/compare.js)
   Features: distance calculation (Haversine), side-by-side
   stats comparison, shared international organisations
   ============================================================ */

import { AppState, navigate, showToast, openHomePicker } from './app.js';
import { loadWorldBankData, loadSharedOrgs,
         haversine, flagUrl, countryStats,
         fmtNumber, fmtArea }                            from './api.js';

/* ── State ───────────────────────────────────────────────────── */
let _initialised  = false;
let _targetCountry = null;   /* country being compared against home */

/* ── Entry point ─────────────────────────────────────────────── */
export function initComparePage() {
  const page = document.getElementById('page-compare');
  if (!page) return;

  if (!_initialised) {
    _initialised = true;
    _buildShell(page);
  }

  /* Check if a target was pre-set (e.g. from detail page CTA) */
  const preTarget = sessionStorage.getItem('worldex:compare-target');
  if (preTarget) {
    sessionStorage.removeItem('worldex:compare-target');
    const country = AppState.countries.find(c => c.cca2 === preTarget);
    if (country) {
      _setTarget(country);
      return;
    }
  }

  _renderState();
}

/* ── Build static shell ──────────────────────────────────────── */
function _buildShell(page) {
  page.innerHTML = `
    <h2 class="t-heading mb-4" style="font-size:1.3rem;">Compare Countries</h2>

    <!-- Home country selector -->
    <div class="compare-setup-row" style="display:flex;gap:var(--sp-3);
         align-items:stretch;margin-bottom:var(--sp-4);flex-wrap:wrap;">

      <!-- Home slot -->
      <div class="compare-slot" id="slot-home"
           style="flex:1;min-width:130px;background:var(--bg-surface);
                  border:1px solid var(--border-mid);border-radius:var(--r-lg);
                  padding:var(--sp-4);cursor:pointer;transition:border-color var(--tx-fast);">
        <div class="t-label mb-2" style="color:var(--text-muted);">Home Country</div>
        <div id="slot-home-content"></div>
      </div>

      <!-- VS divider -->
      <div style="display:flex;align-items:center;justify-content:center;
                  flex-shrink:0;padding:var(--sp-2);">
        <div class="compare-vs">VS</div>
      </div>

      <!-- Target slot -->
      <div class="compare-slot" id="slot-target"
           style="flex:1;min-width:130px;background:var(--bg-surface);
                  border:1px solid var(--border-mid);border-radius:var(--r-lg);
                  padding:var(--sp-4);cursor:pointer;transition:border-color var(--tx-fast);">
        <div class="t-label mb-2" style="color:var(--text-muted);">Select Country</div>
        <div id="slot-target-content"></div>
      </div>
    </div>

    <!-- Target search -->
    <div id="target-search-wrap" class="search-wrap mb-4" style="display:none;">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input id="target-search" class="search-input" type="search"
             placeholder="Search country to compare…" autocomplete="off">
      <button class="search-clear" id="target-search-clear">✕</button>
    </div>
    <div id="target-search-results"
         style="display:none;max-height:280px;overflow-y:auto;
                background:var(--bg-surface);border:1px solid var(--border-mid);
                border-radius:var(--r-lg);margin-bottom:var(--sp-4);
                padding:var(--sp-2);">
    </div>

    <!-- Results area -->
    <div id="compare-results"></div>
  `;

  _bindShellEvents();
}

/* ── Bind shell events ───────────────────────────────────────── */
function _bindShellEvents() {
  /* Home slot — opens home country picker */
  document.getElementById('slot-home')?.addEventListener('click', () => {
    openHomePicker();
  });

  /* Target slot — toggles search */
  document.getElementById('slot-target')?.addEventListener('click', () => {
    _toggleTargetSearch(true);
  });

  /* Target search input */
  const searchEl = document.getElementById('target-search');
  searchEl?.addEventListener('input', e => _searchTarget(e.target.value));

  document.getElementById('target-search-clear')?.addEventListener('click', () => {
    const el = document.getElementById('target-search');
    if (el) el.value = '';
    _searchTarget('');
  });

  /* Listen for home country changes */
  const { on } = window.__worldex || {};
}

/* ── Toggle target search panel ─────────────────────────────── */
function _toggleTargetSearch(show) {
  const wrap    = document.getElementById('target-search-wrap');
  const results = document.getElementById('target-search-results');
  if (wrap)    wrap.style.display    = show ? 'block' : 'none';
  if (results) results.style.display = show ? 'block' : 'none';
  if (show) {
    document.getElementById('target-search')?.focus();
    _searchTarget('');
  }
}

/* ── Search target country ───────────────────────────────────── */
function _searchTarget(query) {
  const results = document.getElementById('target-search-results');
  if (!results) return;

  const home    = AppState.homeCountry;
  let   list    = AppState.countries;

  if (home) list = list.filter(c => c.cca2 !== home.cca2);

  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.capital.toLowerCase().includes(q)
    );
  }

  const slice = list.slice(0, 60);

  results.style.display = 'block';
  results.innerHTML = slice.map(c => `
    <button class="picker-item" data-cca2="${c.cca2}"
            style="width:100%;">
      <img class="picker-flag" src="${flagUrl(c,'w80')}" alt="${c.name}"
           loading="lazy" width="36" height="24">
      <span class="picker-name">${c.name}</span>
      <span style="font-size:0.72rem;color:var(--text-muted);">${c.capital}</span>
    </button>
  `).join('') || `<div class="empty-state" style="padding:var(--sp-5);">
    <p>No results for "${query}"</p></div>`;

  results.querySelectorAll('.picker-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const country = AppState.countries.find(c => c.cca2 === btn.dataset.cca2);
      if (country) _setTarget(country);
    });
  });
}

/* ── Set target country and trigger comparison ───────────────── */
function _setTarget(country) {
  _targetCountry = country;
  _toggleTargetSearch(false);
  _renderState();
  _runComparison();
}

/* ── Render slot UI ──────────────────────────────────────────── */
function _renderState() {
  const home   = AppState.homeCountry;
  const target = _targetCountry;

  /* Home slot */
  const homeContent = document.getElementById('slot-home-content');
  if (homeContent) {
    if (home) {
      homeContent.innerHTML = `
        <div style="display:flex;align-items:center;gap:var(--sp-3);">
          <img src="${flagUrl(home,'w160')}" alt="${home.name}"
               style="width:48px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0;">
          <div>
            <div style="font-family:var(--font-display);font-weight:700;
                        font-size:0.88rem;color:var(--text-primary);">${home.name}</div>
            <div style="font-size:0.7rem;color:var(--teal-bright);">Tap to change</div>
          </div>
        </div>`;
    } else {
      homeContent.innerHTML = `
        <div style="color:var(--text-muted);font-size:0.85rem;
                    display:flex;align-items:center;gap:var(--sp-2);">
          <span style="font-size:1.4rem;">🏠</span>
          <span>Set home country</span>
        </div>`;
    }
  }

  /* Target slot */
  const targetContent = document.getElementById('slot-target-content');
  if (targetContent) {
    if (target) {
      targetContent.innerHTML = `
        <div style="display:flex;align-items:center;gap:var(--sp-3);">
          <img src="${flagUrl(target,'w160')}" alt="${target.name}"
               style="width:48px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0;">
          <div>
            <div style="font-family:var(--font-display);font-weight:700;
                        font-size:0.88rem;color:var(--text-primary);">${target.name}</div>
            <div style="font-size:0.7rem;color:var(--amber-bright);">Tap to change</div>
          </div>
        </div>`;
    } else {
      targetContent.innerHTML = `
        <div style="color:var(--text-muted);font-size:0.85rem;
                    display:flex;align-items:center;gap:var(--sp-2);">
          <span style="font-size:1.4rem;">🔍</span>
          <span>Pick a country</span>
        </div>`;
    }
  }
}

/* ── Run full comparison ─────────────────────────────────────── */
async function _runComparison() {
  const home   = AppState.homeCountry;
  const target = _targetCountry;
  const results = document.getElementById('compare-results');
  if (!results) return;

  if (!home) {
    results.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏠</div>
        <p>Please set your home country first to enable comparisons.</p>
        <button class="btn btn-primary mt-4" id="cmp-set-home">Set Home Country</button>
      </div>`;
    document.getElementById('cmp-set-home')?.addEventListener('click', openHomePicker);
    return;
  }

  if (!target) {
    results.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌍</div>
        <p>Select a country above to compare with ${home.name}.</p>
      </div>`;
    return;
  }

  /* Loading state */
  results.innerHTML = `<div class="loading-center"><div class="spinner"></div>
    <span>Crunching the numbers…</span></div>`;

  try {
    /* Fetch World Bank data for both in parallel */
    const [wbHome, wbTarget, sharedOrgs] = await Promise.all([
      loadWorldBankData(home.cca2),
      loadWorldBankData(target.cca2),
      loadSharedOrgs(home.name, target.name),
    ]);

    const statsHome   = countryStats(home,   wbHome);
    const statsTarget = countryStats(target, wbTarget);

    /* Distance */
    const dist = haversine(
      home.latlng[0],   home.latlng[1],
      target.latlng[0], target.latlng[1]
    );

    results.innerHTML = _buildCompareHTML(home, target, statsHome, statsTarget, dist, sharedOrgs);

    /* Bind view-detail buttons */
    document.getElementById('cmp-view-home')
      ?.addEventListener('click', () => navigate('detail', { cca2: home.cca2 }));
    document.getElementById('cmp-view-target')
      ?.addEventListener('click', () => navigate('detail', { cca2: target.cca2 }));

  } catch (err) {
    console.error('[Compare]', err);
    results.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Failed to load comparison data. Please check your connection.</p>
        <button class="btn btn-primary mt-4" onclick="location.reload()">Retry</button>
      </div>`;
  }
}

/* ── Build comparison HTML ───────────────────────────────────── */
function _buildCompareHTML(home, target, sHome, sTarget, dist, orgs) {
  const statKeys  = ['population','area','gdp','gdpPerCap','lifeExp','literacy','unemployment'];
  const winnerKey = k => {
    /* For unemployment, lower = better; for others higher = better */
    const rawH = sHome[k]?.raw;
    const rawT = sTarget[k]?.raw;
    if (rawH == null || rawT == null) return null;
    if (k === 'unemployment') return rawH < rawT ? 'home' : rawH > rawT ? 'target' : 'tie';
    return rawH > rawT ? 'home' : rawH < rawT ? 'target' : 'tie';
  };

  const rowsHTML = statKeys.map(k => {
    const winner = winnerKey(k);
    return `
      <div class="compare-row">
        <div class="compare-row-val home ${winner === 'home' ? 'winner' : winner === 'target' ? 'loser' : ''}">
          ${sHome[k]?.value || '—'}
          ${winner === 'home' ? ' <span style="color:var(--teal-bright);">▲</span>' : ''}
        </div>
        <div class="compare-row-label">${sHome[k]?.label || k}</div>
        <div class="compare-row-val away ${winner === 'target' ? 'winner' : winner === 'home' ? 'loser' : ''}">
          ${sTarget[k]?.value || '—'}
          ${winner === 'target' ? ' <span style="color:var(--teal-bright);">▲</span>' : ''}
        </div>
      </div>`;
  }).join('');

  const orgsHTML = orgs.length
    ? orgs.map(o => `<span class="org-tag shared">${o}</span>`).join('')
    : `<p style="font-size:0.85rem;color:var(--text-muted);">
         No shared international organisations found.</p>`;

  return `
    <!-- Distance badge -->
    <div class="distance-badge">
      <div class="distance-num">${dist.toLocaleString()} km</div>
      <div class="distance-label">straight-line distance</div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:var(--sp-1);">
        ≈ ${Math.round(dist / 900)} hrs by plane · ${Math.round(dist * 0.621).toLocaleString()} mi
      </div>
    </div>

    <!-- Side by side flags + view detail -->
    <div class="compare-countries" style="margin-bottom:var(--sp-3);">
      <div class="compare-country-info">
        <img class="compare-flag" src="${flagUrl(home,'w320')}" alt="${home.name}">
        <div class="compare-name">${home.name}</div>
        <button class="btn btn-ghost" id="cmp-view-home"
                style="font-size:0.72rem;padding:var(--sp-1) var(--sp-2);margin-top:var(--sp-2);">
          View details →
        </button>
      </div>
      <div class="compare-vs">VS</div>
      <div class="compare-country-info">
        <img class="compare-flag" src="${flagUrl(target,'w320')}" alt="${target.name}">
        <div class="compare-name">${target.name}</div>
        <button class="btn btn-ghost" id="cmp-view-target"
                style="font-size:0.72rem;padding:var(--sp-1) var(--sp-2);margin-top:var(--sp-2);">
          View details →
        </button>
      </div>
    </div>

    <!-- Quick fact chips -->
    <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-bottom:var(--sp-5);">
      ${_factChip('🌍', home.region, target.region === home.region ? 'Same region' : target.region)}
      ${_factChip('🕐', home.timezones[0] || '—', target.timezones[0] || '—')}
      ${_factChip('🚗', _cap(home.drivingSide), _cap(target.drivingSide))}
    </div>

    <!-- Stat comparison rows -->
    <div class="section-head">
      <div class="section-icon">📊</div>
      <h3>Stats Head-to-Head</h3>
    </div>
    <div class="compare-rows mb-5">
      <!-- Header row -->
      <div class="compare-row" style="background:var(--bg-overlay);">
        <div class="compare-row-val home" style="font-family:var(--font-display);
             font-size:0.75rem;color:var(--teal-bright);">${home.name}</div>
        <div class="compare-row-label">Indicator</div>
        <div class="compare-row-val away" style="font-family:var(--font-display);
             font-size:0.75rem;color:var(--amber-bright);">${target.name}</div>
      </div>
      ${rowsHTML}
    </div>

    <!-- Shared organisations -->
    <div class="relations-card">
      <div class="section-head" style="margin-bottom:var(--sp-3);">
        <div class="section-icon">🤝</div>
        <h3>Shared International Organisations</h3>
      </div>
      <div class="org-tags">${orgsHTML}</div>
    </div>
  `;
}

/* ── Helpers ─────────────────────────────────────────────────── */
function _factChip(icon, homeVal, targetVal) {
  const same = homeVal === targetVal;
  return `
    <div style="background:var(--bg-raised);border:1px solid var(--border-subtle);
                border-radius:var(--r-lg);padding:var(--sp-2) var(--sp-3);
                font-size:0.75rem;display:flex;align-items:center;gap:var(--sp-2);">
      <span>${icon}</span>
      <span style="color:var(--teal-bright);">${homeVal}</span>
      ${!same ? `<span style="color:var(--text-muted);">vs</span>
                 <span style="color:var(--amber-bright);">${targetVal}</span>` : ''}
      ${same ? `<span style="color:var(--green-bright);">✓ Same</span>` : ''}
    </div>`;
}

function _cap(s) {
  if (!s || s === '—') return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
