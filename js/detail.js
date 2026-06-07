/* ============================================================
   World Explorer — Country Detail Page  (js/detail.js)
   Tabs: Overview · Geography · Political · Economy · Culture
   ============================================================ */

import { AppState, navigate, showToast }           from './app.js';
import { getCountry, getCountriesByCca3,
         loadWorldBankData, loadWikidataPolitical,
         loadWikiSummary,
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

    /* Write HTML into DOM first, then bind events */
    _renderDetail(country);
    _bindTabs();
    _bindBack();
    _bindNeighbours();

    loadWorldBankData(country.cca2).then(wb => {
      _fillEconomyTab(country, wb);
      _fillDemographyCards(wb);
    });

    loadWikidataPolitical(country.name).then(pol => {
      _fillPoliticalTab(country, pol);
    });

    loadWikiSummary(country.name).then(wiki => {
      _fillWikiSummary(wiki, country);
    });

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
  document.getElementById('page-detail')?.classList.remove('active');
  const target = 'countries';
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

/* ── Fill async tabs ─────────────────────────────────────────── */
function _fillEconomyTab(country, wb) {
  const tab = document.getElementById('tab-economy');
  if (!tab) return;

  const rows = [
    { label:'GDP (USD)',       value: fmtWB('gdp',          wb?.gdp)          },
    { label:'GDP Per Capita',  value: fmtWB('gdpPerCapita', wb?.gdpPerCapita)  },
    { label:'Inflation',       value: fmtWB('inflation',    wb?.inflation)     },
    { label:'Unemployment',    value: fmtWB('unemployment', wb?.unemployment)  },
    { label:'Pop. Density',    value: fmtWB('density',      wb?.density)       },
    { label:'Life Expectancy', value: fmtWB('lifeExp',      wb?.lifeExp)       },
    { label:'Literacy Rate',   value: fmtWB('literacy',     wb?.literacy)      },
  ];

  const currencies = country.currencies.map(c =>
    `${c.name} (${c.symbol || c.code})`).join(', ') || '—';

  tab.innerHTML = `
    <div class="section-head">
      <div class="section-icon">💰</div><h3>Economy &amp; Finance</h3>
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
  const densityEl = document.getElementById('overview-density');
  const lifeEl    = document.getElementById('overview-lifeexp');
  if (densityEl && wb?.density  != null) densityEl.textContent = fmtWB('density', wb.density);
  if (lifeEl    && wb?.lifeExp  != null) lifeEl.textContent    = fmtWB('lifeExp', wb.lifeExp);
}


/* ── Wikipedia summary ───────────────────────────────────────── */
function _fillWikiSummary(wiki, country) {
  const block = document.getElementById('wiki-summary-block');
  if (!block) return;

  if (!wiki?.extract) {
    block.innerHTML = '';
    return;
  }

  block.innerHTML = `
    <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);
                border-left:3px solid var(--accent);border-radius:var(--r-md);
                padding:var(--sp-4) var(--sp-5);margin-bottom:var(--sp-2);">
      <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.75;margin:0;">
        ${wiki.extract}
      </p>
    </div>
    ${wiki.url ? `
      <a href="${wiki.url}" target="_blank" rel="noopener noreferrer"
         style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-display);
                font-weight:600;letter-spacing:0.04em;display:inline-flex;
                align-items:center;gap:4px;text-decoration:none;margin-bottom:var(--sp-2);">
        📖 Read more on Wikipedia
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>` : ''}`;
}

function _fillPoliticalTab(country, pol) {
  const tab = document.getElementById('tab-political');
  if (!tab) return;

  const items = [
    { label:'Government Type',    value: pol?.governmentType || '—' },
    { label:'Head of State',      value: pol?.headOfState    || '—' },
    { label:'Head of Government', value: pol?.headOfGov || pol?.headOfState || '—' },
    { label:'UN Member',          value: country.unMember  ? 'Yes ✓' : 'No' },
    { label:'Independent',        value: country.independent ? 'Yes ✓' : 'No' },
    { label:'FIFA Code',          value: country.fifa || '—' },
    { label:'Calling Code',       value: country.callingCode },
    { label:'Internet TLD',       value: country.tld },
  ];

  tab.innerHTML = `
    <div class="section-head">
      <div class="section-icon">🏛️</div><h3>Political &amp; Administrative</h3>
    </div>
    <div class="info-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));">
      ${items.map(r => `
        <div class="info-card">
          <div class="info-label">${r.label}</div>
          <div class="info-value">${r.value}</div>
        </div>`).join('')}
    </div>
    <p style="font-size:0.72rem;color:var(--text-muted);margin-top:var(--sp-3);">
      Government &amp; leadership data: Wikidata · may not reflect recent changes
    </p>`;
}

/* ── Main render — writes HTML then binds events ─────────────── */
function _renderDetail(c) {
  const flag      = flagUrl(c);
  const langs     = c.languages.join(', ') || '—';
  const timezones = c.timezones.length
    ? c.timezones.slice(0, 3).join(', ') + (c.timezones.length > 3 ? ` +${c.timezones.length - 3} more` : '')
    : '—';
  const isHome    = AppState.homeCountry?.cca2 === c.cca2;

  const neighboursHTML = c.borders.length
    ? `<div class="neighbour-list" id="neighbour-list">
        ${c.borders.map(b => `
          <button class="neighbour-chip" data-cca3="${b}"><span>${b}</span></button>
        `).join('')}
       </div>`
    : `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:var(--sp-2);">
         ${c.landlocked ? 'Landlocked country' : 'No land borders (island nation)'}
       </p>`;

  setTimeout(() => _loadNeighbourFlags(c.borders), 0);

  const page = document.getElementById('page-detail');
  if (!page) return;

  page.innerHTML = `
    <button class="btn-back" id="detail-back">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Back
    </button>

    <div class="detail-hero">
      <img class="detail-flag" src="${flag}" alt="Flag of ${c.name}">
      <div class="detail-hero-body">
        <div class="detail-country-name">${c.name}</div>
        <div class="detail-official-name">${c.officialName}</div>
        ${c.nativeName && c.nativeName !== c.name
          ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:var(--sp-3);font-style:italic;">${c.nativeName}</div>`
          : ''}
        <div class="detail-quick-stats">
          ${_quickStat('Capital',    c.capital)}
          ${_quickStat('Region',     c.subregion || c.region)}
          ${_quickStat('Population', fmtNumber(c.population))}
          ${_quickStat('Area',       fmtArea(c.area))}
          ${_quickStat('Density',    '<span id="overview-density">…</span>')}
          ${_quickStat('Life Exp.',  '<span id="overview-lifeexp">…</span>')}
        </div>
        ${isHome
          ? `<div style="margin-top:var(--sp-4);display:inline-flex;align-items:center;
                         gap:var(--sp-2);background:var(--amber-ghost);
                         border:1px solid var(--amber-dim);border-radius:var(--r-full);
                         padding:var(--sp-1) var(--sp-4);font-size:0.75rem;
                         font-family:var(--font-display);font-weight:700;
                         color:var(--amber-bright);">🏠 Your Home Country</div>`
          : `<button class="btn btn-secondary" id="set-as-home-btn"
                     style="margin-top:var(--sp-4);font-size:0.8rem;
                            padding:var(--sp-2) var(--sp-4);">
               🏠 Set as Home
             </button>`}
      </div>
    </div>

    <div class="tabs-bar" role="tablist">
      ${['overview','geography','political','economy','culture'].map(t => `
        <button class="tab-btn" data-tab="${t}">${_tabLabel(t)}</button>
      `).join('')}
    </div>

    <div class="tab-panel" id="tab-overview">
      <div class="section-head"><div class="section-icon">🌐</div><h3>Overview</h3></div>

      <!-- Wikipedia summary — filled async -->
      <div id="wiki-summary-block" style="margin-bottom:var(--sp-5);">
        <div class="skeleton" style="height:18px;width:90%;margin-bottom:8px;"></div>
        <div class="skeleton" style="height:18px;width:75%;margin-bottom:8px;"></div>
        <div class="skeleton" style="height:18px;width:82%;"></div>
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
    </div>

    <div class="tab-panel" id="tab-geography">
      <div class="section-head"><div class="section-icon">🗺️</div><h3>Geography</h3></div>
      <div class="info-grid">
        ${_infoCard('Latitude',   (c.latlng[0]?.toFixed(4) || '—') + '°')}
        ${_infoCard('Longitude',  (c.latlng[1]?.toFixed(4) || '—') + '°')}
        ${_infoCard('Area',       fmtArea(c.area), 'accent')}
        ${_infoCard('Landlocked', c.landlocked ? 'Yes' : 'No')}
        ${_infoCard('Continents', c.continents.join(', ') || '—')}
        ${_infoCard('Timezones',  timezones)}
      </div>
      <div class="section-head mt-4"><div class="section-icon">📍</div><h3>Map</h3></div>
      <div style="border-radius:var(--r-lg);overflow:hidden;
                  border:1px solid var(--border-subtle);margin-bottom:var(--sp-5);">
        <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${_bbox(c)}&layer=mapnik"
                style="width:100%;height:280px;border:none;display:block;"
                loading="lazy" title="Map of ${c.name}"
                sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
      <div class="section-head">
        <div class="section-icon">🤝</div>
        <h3>Bordering Countries (${c.borders.length})</h3>
      </div>
      ${neighboursHTML}
    </div>

    <div class="tab-panel" id="tab-political">
      <div class="loading-center"><div class="spinner"></div><span>Loading…</span></div>
    </div>

    <div class="tab-panel" id="tab-economy">
      <div class="loading-center"><div class="spinner"></div><span>Loading…</span></div>
    </div>

    <div class="tab-panel" id="tab-culture">
      <div class="section-head"><div class="section-icon">🎭</div><h3>Language &amp; Culture</h3></div>
      <div class="info-grid">
        ${_infoCard('Languages',    langs)}
        ${_infoCard('Timezones',    timezones)}
        ${_infoCard('Start of Week', _cap(c.startOfWeek || 'Monday'))}
        ${_infoCard('FIFA Code',    c.fifa || '—')}
        ${c.currencies.map(cur =>
          _infoCard('Currency',
            `${cur.name}<br><span style="color:var(--teal-bright);font-weight:700;">${cur.symbol || ''} ${cur.code}</span>`)
        ).join('')}
      </div>
    </div>

    ${AppState.homeCountry && AppState.homeCountry.cca2 !== c.cca2 ? `
      <div id="compare-cta" style="margin-top:var(--sp-8);padding:var(--sp-5);
                  background:var(--teal-ghost);border:1px solid var(--teal-dim);
                  border-radius:var(--r-xl);text-align:center;">
        <div style="font-family:var(--font-display);font-weight:700;font-size:1rem;
                    color:var(--text-primary);margin-bottom:var(--sp-2);">
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

  /* Bind events AFTER HTML is in the DOM */
  document.getElementById('set-as-home-btn')?.addEventListener('click', async () => {
    const country = await getCountry(c.cca2);
    if (country) {
      const { saveHomeCountry } = await import('./app.js');
      saveHomeCountry(country);
      showToast(`🏠 ${country.name} set as home country`, 'success');
      initDetailPage(c.cca2);
    }
  });

  document.getElementById('go-compare-btn')?.addEventListener('click', () => {
    sessionStorage.setItem('worldex:compare-target', c.cca2);
    navigate('compare');
  });
}

/* ── Load neighbour flags async ──────────────────────────────── */
async function _loadNeighbourFlags(borders) {
  if (!borders.length) return;
  try {
    const neighbours = await getCountriesByCca3(borders);
    const chips = document.querySelectorAll('.neighbour-chip[data-cca3]');
    chips.forEach(chip => {
      const country = neighbours.find(n => n.cca3 === chip.dataset.cca3);
      if (!country) return;
      chip.innerHTML = `
        <img src="${flagUrl(country)}" alt="${country.name}"
             width="20" height="14" style="object-fit:cover;border-radius:2px;">
        <span>${country.name}</span>`;
      chip.dataset.cca2 = country.cca2;
    });
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.dataset.cca2) navigate('detail', { cca2: chip.dataset.cca2 });
      });
    });
  } catch { /* silent */ }
}

/* ── Helpers ─────────────────────────────────────────────────── */
function _quickStat(label, value) {
  return `<div class="quick-stat">
    <div class="quick-stat-label">${label}</div>
    <div class="quick-stat-value">${value}</div>
  </div>`;
}

function _infoCard(label, value, cls = '') {
  return `<div class="info-card">
    <div class="info-label">${label}</div>
    <div class="info-value ${cls}">${value}</div>
  </div>`;
}

function _tabLabel(t) {
  return { overview:'🌐 Overview', geography:'🗺️ Geo', political:'🏛️ Political',
           economy:'💰 Economy', culture:'🎭 Culture' }[t] || t;
}

function _cap(s) {
  if (!s || s === '—') return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function _bbox(country) {
  const [lat, lng] = country.latlng;
  const spread = country.area > 1000000 ? 15 : country.area > 100000 ? 8
               : country.area > 10000 ? 4 : 2;
  return `${lng-spread},${lat-spread},${lng+spread},${lat+spread}`;
}

function _skeletonHTML() {
  return `<div style="padding:var(--sp-4);">
    <div class="skeleton" style="width:80px;height:24px;margin-bottom:var(--sp-5);"></div>
    <div class="skeleton" style="width:100%;height:220px;border-radius:var(--r-xl);margin-bottom:var(--sp-5);"></div>
    <div class="skeleton" style="width:60%;height:32px;margin-bottom:var(--sp-3);"></div>
    <div class="skeleton" style="width:40%;height:20px;margin-bottom:var(--sp-5);"></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-3);margin-bottom:var(--sp-5);">
      ${Array(6).fill('<div class="skeleton" style="height:64px;border-radius:var(--r-md);"></div>').join('')}
    </div>
    <div class="skeleton" style="width:100%;height:48px;border-radius:var(--r-md);"></div>
  </div>`;
}
