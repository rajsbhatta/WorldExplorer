/* ============================================================
   World Explorer — Country Detail Page  (js/detail.js)
   Tabs: Overview · Geography · Political · Economy · Culture
   ============================================================ */

import { AppState, navigate, showToast }           from './app.js';
import { getCountry, getCountriesByCca3,
         loadWorldBankData, loadWikidataPolitical,
         flagUrl, fmtNumber, fmtArea, fmtWB }      from './api.js';

/* ── Entry point ─────────────────────────────────────────────── */
export async function initDetailPage(cca2) {
  const page = document.getElementById('page-detail');
  if (!page) return;

  page.classList.add('active');
  page.innerHTML = _skeletonHTML();

  try {
    const country = await getCountry(cca2);
    if (!country) throw new Error('Country not found');

    /* Render shell immediately with REST Countries data */
    page.innerHTML = _detailHTML(country);
    _bindTabs();
    _bindBack();
    _bindNeighbours();

    /* Load World Bank data async — fills in Economy tab */
    loadWorldBankData(country.cca2).then(wb => {
      _fillEconomyTab(country, wb);
      _fillDemographyCards(wb);
    });

    /* Load Wikidata async — fills in Political tab */
    loadWikidataPolitical(country.name).then(pol => {
      _fillPoliticalTab(country, pol);
    });

    /* Activate first tab */
    _activateTab('overview');

  } catch (err) {
    console.error('[Detail]', err);
    page.innerHTML = `
      <button class="btn-back" id="detail-back">← Back</button>
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Could not load country details. Please try again.</p>
        <button class="btn btn-primary mt-4" onclick="history.back()">Go Back</button>
      </div>`;
    document.getElementById('detail-back')?.addEventListener('click', _goBack);
  }
}

/* ── Back navigation ─────────────────────────────────────────── */
function _goBack() {
  /* Return to whichever page makes sense */
  const prev = AppState.currentPage;
  document.getElementById('page-detail')?.classList.remove('active');

  const target = ['countries','compare','games'].includes(prev) ? prev : 'countries';
  ['home','countries','compare','games'].forEach(id => {
    document.getElementById(`page-${id}`)
      ?.classList.toggle('active', id === target);
  });
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.page === target)
  );
  history.replaceState(null, '', `#${target}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function _bindBack() {
  document.getElementById('detail-back')?.addEventListener('click', _goBack);
}

/* ── Tabs ────────────────────────────────────────────────────── */
function _bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => _activateTab(btn.dataset.tab));
  });
}

function _activateTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${tabId}`)
  );
}

/* ── Neighbour chips ─────────────────────────────────────────── */
function _bindNeighbours() {
  document.querySelectorAll('.neighbour-chip[data-cca3]').forEach(chip => {
    chip.addEventListener('click', async () => {
      const countries = await getCountriesByCca3([chip.dataset.cca3]);
      if (countries[0]) navigate('detail', { cca2: countries[0].cca2 });
    });
  });
}

/* ── Fill tabs with async data ───────────────────────────────── */
function _fillEconomyTab(country, wb) {
  const tab = document.getElementById('tab-economy');
  if (!tab) return;

  const rows = [
    { label: 'GDP (USD)',       value: fmtWB('gdp',          wb?.gdp)          },
    { label: 'GDP Per Capita',  value: fmtWB('gdpPerCapita', wb?.gdpPerCapita)  },
    { label: 'Inflation',       value: fmtWB('inflation',    wb?.inflation)     },
    { label: 'Unemployment',    value: fmtWB('unemployment', wb?.unemployment)  },
    { label: 'Pop. Density',    value: fmtWB('density',      wb?.density)       },
    { label: 'Life Expectancy', value: fmtWB('lifeExp',      wb?.lifeExp)       },
    { label: 'Literacy Rate',   value: fmtWB('literacy',     wb?.literacy)      },
  ];

  const currencies = country.currencies.map(c =>
    `${c.name} (${c.symbol || c.code})`
  ).join(', ') || '—';

  tab.innerHTML = `
    <div class="section-head">
      <div class="section-icon">💰</div>
      <h3>Economy &amp; Finance</h3>
    </div>
    <div class="info-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));">
      ${rows.map(r => `
        <div class="info-card">
          <div class="info-label">${r.label}</div>
          <div class="info-value accent">${r.value}</div>
        </div>`).join('')}
      <div class="info-card">
        <div class="info-label">Currency</div>
        <div class="info-value" style="font-size:0.82rem;">${currencies}</div>
      </div>
    </div>
    <p style="font-size:0.72rem;color:var(--text-muted);margin-top:var(--sp-3);">
      Source: World Bank Open Data · Most recent available year
    </p>`;
}

function _fillDemographyCards(wb) {
  /* Update the skeleton density + life exp cards in overview */
  const densityEl = document.getElementById('overview-density');
  const lifeEl    = document.getElementById('overview-lifeexp');
  if (densityEl && wb?.density   != null) densityEl.textContent = fmtWB('density', wb.density);
  if (lifeEl    && wb?.lifeExp   != null) lifeEl.textContent    = fmtWB('lifeExp', wb.lifeExp);
}

function _fillPoliticalTab(country, pol) {
  const tab = document.getElementById('tab-political');
  if (!tab) return;

  const items = [
    { label: 'Government Type',   value: pol?.governmentType || '—'   },
    { label: 'Head of State',     value: pol?.headOfState    || '—'   },
    { label: 'Head of Government',value: pol?.headOfGov      || pol?.headOfState || '—' },
    { label: 'UN Member',         value: country.unMember ? 'Yes ✓' : 'No'  },
    { label: 'Independent',       value: country.independent ? 'Yes ✓' : 'No' },
    { label: 'FIFA Code',         value: country.fifa || '—'          },
    { label: 'Calling Code',      value: country.callingCode           },
    { label: 'Internet TLD',      value: country.tld                  },
    { label: 'Driving Side',      value: _cap(country.drivingSide)    },
  ];

  tab.innerHTML = `
    <div class="section-head">
      <div class="section-icon">🏛️</div>
      <h3>Political &amp; Administrative</h3>
    </div>
    <div class="info-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));">
      ${items.map(r => `
        <div class="info-card">
          <div class="info-label">${r.label}</div>
          <div class="info-value">${r.value}</div>
        </div>`).join('')}
    </div>
    <p style="font-size:0.72rem;color:var(--text-muted);margin-top:var(--sp-3);">
      Government &amp; leadership data: Wikidata · may not reflect very recent changes
    </p>`;
}

/* ── Main HTML template ──────────────────────────────────────── */
function _detailHTML(c) {
  const flag       = flagUrl(c, 'w1280');
  const flagSmall  = flagUrl(c, 'w320');
  const langs      = c.languages.join(', ') || '—';
  const timezones  = c.timezones.slice(0, 3).join(', ') +
                     (c.timezones.length > 3 ? ` +${c.timezones.length - 3} more` : '');
  const isHome     = AppState.homeCountry?.cca2 === c.cca2;

  const neighboursHTML = c.borders.length
    ? `<div class="neighbour-list" id="neighbour-list">
        ${c.borders.map(b => `
          <button class="neighbour-chip" data-cca3="${b}">
            <span>${b}</span>
          </button>`).join('')}
       </div>`
    : `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:var(--sp-2);">
         ${c.landlocked ? 'Landlocked country' : 'No land borders (island nation)'}
       </p>`;

  /* Load neighbour flags asynchronously */
  setTimeout(() => _loadNeighbourFlags(c.borders), 0);

  return `
    <!-- Back button -->
    <button class="btn-back" id="detail-back">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Back
    </button>

    <!-- Hero -->
    <div class="detail-hero">
      <img class="detail-flag" src="${flag}" alt="Flag of ${c.name}"
           onerror="this.src='${flagSmall}'">
      <div class="detail-hero-body">
        <div class="detail-country-name">${c.name}</div>
        <div class="detail-official-name">${c.officialName}</div>
        ${c.nativeName && c.nativeName !== c.name
          ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:-var(--sp-2);
                          margin-bottom:var(--sp-3);font-style:italic;">${c.nativeName}</div>`
          : ''}

        <div class="detail-quick-stats">
          ${_quickStat('Capital',    c.capital)}
          ${_quickStat('Region',     c.subregion || c.region)}
          ${_quickStat('Population', fmtNumber(c.population))}
          ${_quickStat('Area',       fmtArea(c.area))}
          ${_quickStat('Density',    '<span id="overview-density">…</span>')}
          ${_quickStat('Life Exp.',  '<span id="overview-lifeexp">…</span>')}
        </div>

        ${isHome ? `
          <div style="margin-top:var(--sp-4);display:inline-flex;align-items:center;
                      gap:var(--sp-2);background:var(--amber-ghost);border:1px solid var(--amber-dim);
                      border-radius:var(--r-full);padding:var(--sp-1) var(--sp-4);
                      font-size:0.75rem;font-family:var(--font-display);
                      font-weight:700;color:var(--amber-bright);">
            🏠 Your Home Country
          </div>` : `
          <button class="btn btn-secondary" id="set-as-home-btn"
                  style="margin-top:var(--sp-4);font-size:0.8rem;padding:var(--sp-2) var(--sp-4);">
            🏠 Set as Home
          </button>`}
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs-bar" role="tablist">
      ${['overview','geography','political','economy','culture'].map(t => `
        <button class="tab-btn" data-tab="${t}" role="tab"
                aria-selected="false" aria-controls="tab-${t}">
          ${_tabLabel(t)}
        </button>`).join('')}
    </div>

    <!-- Tab: Overview -->
    <div class="tab-panel" id="tab-overview" role="tabpanel">
      <div class="section-head">
        <div class="section-icon">🌐</div>
        <h3>Overview</h3>
      </div>
      <div class="info-grid">
        ${_infoCard('Official Name', c.officialName)}
        ${_infoCard('CCA2 Code',     c.cca2)}
        ${_infoCard('CCA3 Code',     c.cca3)}
        ${_infoCard('Capital',       c.capital)}
        ${_infoCard('Region',        c.region)}
        ${_infoCard('Sub-Region',    c.subregion || '—')}
        ${_infoCard('Population',    fmtNumber(c.population), 'accent')}
        ${_infoCard('Area',          fmtArea(c.area), 'accent')}
        ${_infoCard('Landlocked',    c.landlocked ? 'Yes' : 'No')}
        ${_infoCard('UN Member',     c.unMember ? 'Yes ✓' : 'No')}
        ${_infoCard('Calling Code',  c.callingCode)}
        ${_infoCard('TLD',           c.tld)}
      </div>

      <!-- Coat of arms placeholder removed (not in data source) -->
    </div>

    <!-- Tab: Geography -->
    <div class="tab-panel" id="tab-geography" role="tabpanel">
      <div class="section-head">
        <div class="section-icon">🗺️</div>
        <h3>Geography</h3>
      </div>
      <div class="info-grid">
        ${_infoCard('Latitude',     c.latlng[0]?.toFixed(4) + '°' || '—')}
        ${_infoCard('Longitude',    c.latlng[1]?.toFixed(4) + '°' || '—')}
        ${_infoCard('Area',         fmtArea(c.area), 'accent')}
        ${_infoCard('Landlocked',   c.landlocked ? 'Yes' : 'No')}
        ${_infoCard('Continents',   c.continents.join(', ') || '—')}
        ${_infoCard('Timezones',    timezones)}
      </div>

      <!-- OpenStreetMap embed -->
      <div class="section-head mt-4">
        <div class="section-icon">📍</div>
        <h3>Map</h3>
      </div>
      <div style="border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--border-subtle);
                  margin-bottom:var(--sp-5);background:var(--bg-raised);">
        <iframe
          src="https://www.openstreetmap.org/export/embed.html?bbox=${_bbox(c)}&layer=mapnik"
          style="width:100%;height:280px;border:none;display:block;"
          loading="lazy"
          title="Map of ${c.name}"
          sandbox="allow-scripts allow-same-origin">
        </iframe>
      </div>

      <!-- Neighbours -->
      <div class="section-head">
        <div class="section-icon">🤝</div>
        <h3>Bordering Countries (${c.borders.length})</h3>
      </div>
      ${neighboursHTML}
    </div>

    <!-- Tab: Political (filled async) -->
    <div class="tab-panel" id="tab-political" role="tabpanel">
      <div class="loading-center">
        <div class="spinner"></div>
        <span>Loading political data…</span>
      </div>
    </div>

    <!-- Tab: Economy (filled async) -->
    <div class="tab-panel" id="tab-economy" role="tabpanel">
      <div class="loading-center">
        <div class="spinner"></div>
        <span>Loading economic data…</span>
      </div>
    </div>

    <!-- Tab: Culture -->
    <div class="tab-panel" id="tab-culture" role="tabpanel">
      <div class="section-head">
        <div class="section-icon">🎭</div>
        <h3>Language &amp; Culture</h3>
      </div>
      <div class="info-grid">
        ${_infoCard('Languages',    langs)}
        ${_infoCard('Timezones',    timezones)}
        ${_infoCard('Driving Side', _cap(c.drivingSide))}
        ${_infoCard('Start of Week',_cap(c.startOfWeek || '—'))}
        ${_infoCard('FIFA Code',    c.fifa || '—')}
        ${c.currencies.map(cur =>
          _infoCard(`Currency`, `${cur.name}<br><span style="color:var(--teal-bright);font-weight:700;">${cur.symbol || ''} ${cur.code}</span>`)
        ).join('')}
      </div>

    <!-- Flag alt text not available in current data source -->
    </div>

    <!-- Compare CTA -->
    ${AppState.homeCountry && AppState.homeCountry.cca2 !== c.cca2 ? `
      <div style="margin-top:var(--sp-8);padding:var(--sp-5);
                  background:var(--teal-ghost);border:1px solid var(--teal-dim);
                  border-radius:var(--r-xl);text-align:center;">
        <div style="font-family:var(--font-display);font-weight:700;
                    font-size:1rem;color:var(--text-primary);margin-bottom:var(--sp-2);">
          Compare with ${AppState.homeCountry.name}
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:var(--sp-4);">
          See distance, stats comparison, and shared organisations
        </p>
        <button class="btn btn-primary" id="go-compare-btn">
          Compare Countries →
        </button>
      </div>` : ''}
  `;

  /* Bind "Set as Home" button */
  document.getElementById('set-as-home-btn')?.addEventListener('click', async () => {
    const country = await getCountry(c.cca2);
    if (country) {
      const { saveHomeCountry } = await import('./app.js');
      saveHomeCountry(country);
      showToast(`🏠 ${country.name} set as home country`, 'success');
      /* Re-render detail to update badge */
      initDetailPage(c.cca2);
    }
  });

  /* Bind compare CTA */
  document.getElementById('go-compare-btn')?.addEventListener('click', () => {
    /* Store target for compare page */
    sessionStorage.setItem('worldex:compare-target', c.cca2);
    navigate('compare');
  });

  return document.getElementById('page-detail')?.innerHTML || '';
}

/* ── Load neighbour flags ────────────────────────────────────── */
async function _loadNeighbourFlags(borders) {
  if (!borders.length) return;
  try {
    const neighbours = await getCountriesByCca3(borders);
    const chips = document.querySelectorAll('.neighbour-chip[data-cca3]');
    chips.forEach(chip => {
      const country = neighbours.find(n => n.cca3 === chip.dataset.cca3);
      if (!country) return;
      chip.innerHTML = `
        <img src="${flagUrl(country, 'w80')}" alt="${country.name}"
             width="20" height="14" style="object-fit:cover;border-radius:2px;">
        <span>${country.name}</span>`;
      chip.dataset.cca2 = country.cca2;
    });

    /* Re-bind with real cca2 now */
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.dataset.cca2) navigate('detail', { cca2: chip.dataset.cca2 });
      });
    });
  } catch { /* silently skip */ }
}

/* ── Helpers ──────────────────────────────────────────────────── */
function _quickStat(label, value) {
  return `
    <div class="quick-stat">
      <div class="quick-stat-label">${label}</div>
      <div class="quick-stat-value">${value}</div>
    </div>`;
}

function _infoCard(label, value, cls = '') {
  return `
    <div class="info-card">
      <div class="info-label">${label}</div>
      <div class="info-value ${cls}">${value}</div>
    </div>`;
}

function _tabLabel(t) {
  const map = {
    overview:   '🌐 Overview',
    geography:  '🗺️ Geography',
    political:  '🏛️ Political',
    economy:    '💰 Economy',
    culture:    '🎭 Culture',
  };
  return map[t] || t;
}

function _cap(s) {
  if (!s || s === '—') return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Compute a bounding box for OSM embed from latlng */
function _bbox(country) {
  const [lat, lng] = country.latlng;
  /* Larger countries get bigger zoom-out */
  const spread = country.area > 1000000 ? 15
               : country.area > 100000  ? 8
               : country.area > 10000   ? 4
               : 2;
  return `${lng - spread},${lat - spread},${lng + spread},${lat + spread}`;
}

function _skeletonHTML() {
  return `
    <div style="padding:var(--sp-4);">
      <div class="skeleton" style="width:80px;height:24px;margin-bottom:var(--sp-5);"></div>
      <div class="skeleton" style="width:100%;height:220px;border-radius:var(--r-xl);
                                    margin-bottom:var(--sp-5);"></div>
      <div class="skeleton" style="width:60%;height:32px;margin-bottom:var(--sp-3);"></div>
      <div class="skeleton" style="width:40%;height:20px;margin-bottom:var(--sp-5);"></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-3);
                  margin-bottom:var(--sp-5);">
        ${Array(6).fill('<div class="skeleton" style="height:64px;border-radius:var(--r-md);"></div>').join('')}
      </div>
      <div class="skeleton" style="width:100%;height:48px;border-radius:var(--r-md);
                                    margin-bottom:var(--sp-5);"></div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--sp-3);">
        ${Array(4).fill('<div class="skeleton" style="height:80px;border-radius:var(--r-md);"></div>').join('')}
      </div>
    </div>`;
}
