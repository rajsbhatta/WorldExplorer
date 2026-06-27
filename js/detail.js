/* ============================================================
   World Explorer — Country Detail Page  (js/detail.js)
   Tabs: Overview · Geography · Political · Economy · Culture
   Features: Passport stamps · PDF download
   ============================================================ */

import { AppState, navigate, showToast }           from './app.js';
import { getCountry, getCountriesByCca3,
         loadWorldBankData, loadWikidataPolitical,
         loadWikiSummary, flagUrl,
         fmtNumber, fmtArea, fmtWB,
         getStamp, setStamp,
         getCitizenships, isCitizen }              from './api.js';

/* ── Entry point ─────────────────────────────────────────────── */
export async function initDetailPage(cca2) {
  const page = document.getElementById('page-detail');
  if (!page) return;
  page.classList.add('active');
  page.innerHTML = _skeletonHTML();

  try {
    const country = await getCountry(cca2);
    if (!country) throw new Error('Country not found');

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
      </div>`;
    document.getElementById('detail-back')?.addEventListener('click', _goBack);
  }
}

/* ── Back ────────────────────────────────────────────────────── */
function _goBack() {
  document.getElementById('page-detail')?.classList.remove('active');
  const target = 'countries';
  ['home','countries','compare','games','settings'].forEach(id =>
    document.getElementById(`page-${id}`)?.classList.toggle('active', id === target)
  );
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.page === target)
  );
  history.replaceState(null, '', `#${target}`);
  window.scrollTo({ top:0, behavior:'instant' });
}

function _bindBack() {
  document.getElementById('detail-back')?.addEventListener('click', _goBack);
}

/* ── Tabs ────────────────────────────────────────────────────── */
function _bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => _activateTab(btn.dataset.tab))
  );
}
function _activateTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${tabId}`)
  );
}

/* ── Neighbours ──────────────────────────────────────────────── */
function _bindNeighbours() {
  document.querySelectorAll('.neighbour-chip[data-cca3]').forEach(chip => {
    chip.addEventListener('click', async () => {
      const countries = await getCountriesByCca3([chip.dataset.cca3]);
      if (countries[0]) navigate('detail', { cca2: countries[0].cca2 });
    });
  });
}

/* ── Async tab fills ─────────────────────────────────────────── */
function _fillWikiSummary(wiki, country) {
  const block = document.getElementById('wiki-summary-block');
  if (!block) return;
  if (!wiki?.extract) { block.innerHTML = ''; return; }
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
                align-items:center;gap:4px;text-decoration:none;margin-bottom:var(--sp-3);">
        📖 Read more on Wikipedia
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>` : ''}`;
}

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
  const currencies = country.currencies.map(c => `${c.name} (${c.symbol || c.code})`).join(', ') || '—';
  tab.innerHTML = `
    <div class="section-head"><div class="section-icon">💰</div><h3>Economy &amp; Finance</h3></div>
    <div class="info-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));">
      ${rows.map(r => `<div class="info-card"><div class="info-label">${r.label}</div><div class="info-value accent">${r.value}</div></div>`).join('')}
      <div class="info-card"><div class="info-label">Currency</div><div class="info-value" style="font-size:0.82rem;">${currencies}</div></div>
    </div>
    <p style="font-size:0.72rem;color:var(--text-muted);margin-top:var(--sp-3);">Source: World Bank Open Data · Most recent available year</p>`;
}

function _fillDemographyCards(wb) {
  const d = document.getElementById('overview-density');
  const l = document.getElementById('overview-lifeexp');
  if (d && wb?.density  != null) d.textContent = fmtWB('density', wb.density);
  if (l && wb?.lifeExp  != null) l.textContent = fmtWB('lifeExp', wb.lifeExp);
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
    <div class="section-head"><div class="section-icon">🏛️</div><h3>Political &amp; Administrative</h3></div>
    <div class="info-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));">
      ${items.map(r => `<div class="info-card"><div class="info-label">${r.label}</div><div class="info-value">${r.value}</div></div>`).join('')}
    </div>
    <p style="font-size:0.72rem;color:var(--text-muted);margin-top:var(--sp-3);">Government &amp; leadership data: Wikidata · may not reflect recent changes</p>`;
}

/* ── Passport stamp UI ───────────────────────────────────────── */
function _stampHTML(cca2) {
  const stamp        = getStamp(cca2);
  const type         = stamp?.type || null;
  const citizenships = getCitizenships();
  const maxCitizens  = citizenships.length >= 2 && !citizenships.includes(cca2);

  return `
    <div class="stamp-bar" id="stamp-bar">
      <button class="stamp-btn ${type === 'visited' ? 'active visited' : ''}"
              id="stamp-visited" data-type="visited" title="Mark as visited">
        <span class="stamp-icon">✈️</span>
        <span class="stamp-label">Visited${type === 'visited' && stamp?.year ? ' · ' + stamp.year : ''}</span>
      </button>
      <button class="stamp-btn ${type === 'wishlist' ? 'active wishlist' : ''}"
              id="stamp-wishlist" data-type="wishlist" title="Add to wish list">
        <span class="stamp-icon">⭐</span>
        <span class="stamp-label">Wish List</span>
      </button>
      ${!maxCitizens ? `
      <button class="stamp-btn ${type === 'citizen' ? 'active citizen' : ''}"
              id="stamp-citizen" data-type="citizen" title="Mark as citizen">
        <span class="stamp-icon">🛂</span>
        <span class="stamp-label">Citizen</span>
      </button>` : ''}
    </div>`;
}

function _stampOverlayHTML(cca2) {
  const stamp = getStamp(cca2);
  if (!stamp) return '';
  const isCit     = stamp.type === 'citizen';
  const isVisited = stamp.type === 'visited';
  const year      = stamp.year || new Date().getFullYear();
  const cls       = isCit ? 'stamp-citizen' : isVisited ? 'stamp-visited' : 'stamp-wishlist';
  const emoji     = isCit ? '🛂' : isVisited ? '✈️' : '⭐';
  const label     = isCit ? 'CITIZEN' : isVisited ? 'VISITED' : 'WISH LIST';
  return `
    <div class="stamp-overlay ${cls}" aria-label="${label}">
      <div class="stamp-ring">
        <div class="stamp-inner">
          <div class="stamp-emoji">${emoji}</div>
          <div class="stamp-text">${label}</div>
          <div class="stamp-year">${year}</div>
        </div>
      </div>
    </div>`;
}

function _askVisitYear() {
  const currentYear = new Date().getFullYear();
  return new Promise(resolve => {
    /* Build inline year-picker modal */
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.65);
      backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;`;

    const years = Array.from({ length: 50 }, (_, i) => currentYear - i);
    overlay.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--border-mid);
                  border-radius:var(--r-xl);padding:var(--sp-6);width:100%;max-width:320px;
                  animation:fadeUp 280ms ease both;">
        <div style="font-family:var(--font-display);font-weight:800;font-size:1.1rem;
                    color:var(--text-primary);margin-bottom:var(--sp-2);">
          ✈️ When did you visit?
        </div>
        <p style="font-size:0.83rem;color:var(--text-secondary);margin-bottom:var(--sp-5);">
          Select the year of your visit. This will appear on your stamp.
        </p>
        <select id="year-picker" class="form-select" style="margin-bottom:var(--sp-5);">
          ${years.map(y => `<option value="${y}"${y === currentYear ? ' selected' : ''}>${y}</option>`).join('')}
        </select>
        <div style="display:flex;gap:var(--sp-3);">
          <button id="year-cancel" class="btn btn-secondary btn-full">Cancel</button>
          <button id="year-confirm" class="btn btn-primary btn-full">Stamp It!</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#year-confirm').addEventListener('click', () => {
      const year = parseInt(overlay.querySelector('#year-picker').value);
      document.body.removeChild(overlay);
      resolve(year);
    });
    overlay.querySelector('#year-cancel').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); }
    });
  });
}

function _askDualCitizenship(existingCca2) {
  return new Promise(resolve => {
    const existing = AppState.countries.find(c => c.cca2 === existingCca2);
    const name     = existing?.name || existingCca2;
    const overlay  = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.65);
      backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;`;
    overlay.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--border-mid);
                  border-radius:var(--r-xl);padding:var(--sp-6);width:100%;max-width:340px;
                  animation:fadeUp 280ms ease both;">
        <div style="font-family:var(--font-display);font-weight:800;font-size:1.05rem;
                    color:var(--text-primary);margin-bottom:var(--sp-3);">
          🛂 Citizenship Conflict
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;margin-bottom:var(--sp-5);">
          You are already a citizen of <strong>${name}</strong>. What would you like to do?
        </p>
        <div style="display:flex;flex-direction:column;gap:var(--sp-3);">
          <button id="cit-dual" class="btn btn-primary btn-full">
            Add as Dual Citizenship
          </button>
          <button id="cit-replace" class="btn btn-secondary btn-full">
            Replace — Remove ${name}
          </button>
          <button id="cit-cancel" class="btn btn-ghost btn-full">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cit-dual')   .addEventListener('click', () => { document.body.removeChild(overlay); resolve('dual'); });
    overlay.querySelector('#cit-replace').addEventListener('click', () => { document.body.removeChild(overlay); resolve('replace'); });
    overlay.querySelector('#cit-cancel') .addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
    overlay.addEventListener('click', e => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); } });
  });
}

function _bindStampButtons(cca2) {
  document.querySelectorAll('.stamp-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type    = btn.dataset.type;
      const current = getStamp(cca2);
      const isToggleOff = current?.type === type;

      if (isToggleOff) {
        /* Remove stamp */
        setStamp(cca2, null);
        _refreshStampUI(cca2);
        showToast('Stamp removed', 'info', 2000);
        return;
      }

      if (type === 'visited') {
        const year = await _askVisitYear();
        if (year === null) return;
        setStamp(cca2, 'visited', year);
      } else if (type === 'citizen') {
        const citizenships = getCitizenships();
        const alreadyHas   = citizenships.includes(cca2);

        if (!alreadyHas && citizenships.length === 1) {
          /* One existing citizenship — ask: replace or dual? */
          const other = citizenships[0];
          const choice = await _askDualCitizenship(other);
          /* choice: 'replace' | 'dual' | null */
          if (choice === null) return;
          if (choice === 'replace') {
            setStamp(other, null);   /* remove old */
          }
          /* both 'replace' and 'dual' then stamp the new one */
          setStamp(cca2, 'citizen');
        } else {
          setStamp(cca2, 'citizen');
        }
      } else {
        setStamp(cca2, 'wishlist');
      }

      _refreshStampUI(cca2);
      const msgs = {
        visited:  `✈️ Stamped as visited!`,
        wishlist: `⭐ Added to wish list!`,
      };
      showToast(msgs[type], 'success', 2000);
    });
  });
}

function _refreshStampUI(cca2) {
  /* Rebuild stamp bar */
  const bar = document.getElementById('stamp-bar');
  if (bar) bar.outerHTML = _stampHTML(cca2);
  _bindStampButtons(cca2); /* rebind after outerHTML swap */

  /* Update overlay */
  const wrap = document.getElementById('stamp-overlay-wrap');
  if (wrap) wrap.innerHTML = _stampOverlayHTML(cca2);
}

/* ── PDF download ────────────────────────────────────────────── */
function _downloadPDF(c, wb) {
  /* Build a self-contained print window */
  const stamp     = getStamp(c.cca2);
  const stampYear = stamp?.year || new Date().getFullYear();
  const stampHtml = stamp ? `
    <div class="stamp-overlay-print ${stamp.type}">
      <div class="stamp-ring-print">
        ${stamp.type === 'visited' ? '✈️ VISITED' : '⭐ WISH LIST'}<br>
        <span style="font-size:11px;">${stampYear}</span>
      </div>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${c.name} — World Explorer</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#111; background:#fff; padding:32px; font-size:13px; line-height:1.5; }
  .header { display:flex; align-items:center; gap:20px; margin-bottom:24px; padding-bottom:16px; border-bottom:2px solid #111; position:relative; }
  .flag { width:120px; height:80px; object-fit:cover; border-radius:6px; border:1px solid #ddd; }
  .country-name { font-size:28px; font-weight:800; letter-spacing:-0.03em; }
  .official-name { font-size:13px; color:#555; margin-top:3px; font-style:italic; }
  .region-badge { display:inline-block; background:#f0f0f0; border-radius:99px; padding:3px 12px; font-size:11px; font-weight:600; margin-top:6px; color:#333; letter-spacing:0.04em; text-transform:uppercase; }
  .stamp-overlay-print { position:absolute; right:0; top:0; border-radius:50%; width:90px; height:90px; display:flex; align-items:center; justify-content:center; text-align:center; font-weight:800; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; border:4px solid; opacity:0.85; padding:8px; line-height:1.3; }
  .stamp-overlay-print.visited  { border-color:#009f7e; color:#009f7e; }
  .stamp-overlay-print.wishlist { border-color:#c88d0e; color:#c88d0e; }
  .section { margin-bottom:20px; }
  .section-title { font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#888; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #eee; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .cell { background:#f8f8f8; border-radius:6px; padding:10px; }
  .cell-label { font-size:9px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#888; margin-bottom:3px; }
  .cell-value { font-size:13px; font-weight:600; color:#111; }
  .cell-value.accent { color:#009f7e; }
  .wiki-box { background:#f0faf7; border-left:3px solid #009f7e; border-radius:4px; padding:12px 14px; font-size:12px; color:#333; line-height:1.7; margin-bottom:16px; }
  .footer { margin-top:32px; padding-top:12px; border-top:1px solid #eee; font-size:10px; color:#aaa; display:flex; justify-content:space-between; }
  @media print { body { padding:20px; } }
</style>
</head>
<body>
  <div class="header">
    <img class="flag" src="${flagUrl(c)}" alt="Flag of ${c.name}" crossorigin="anonymous">
    <div>
      <div class="country-name">${c.name}</div>
      <div class="official-name">${c.officialName}</div>
      <div class="region-badge">${c.region}${c.subregion ? ' · ' + c.subregion : ''}</div>
    </div>
    ${stampHtml}
  </div>

  ${wb?._wikiExtract ? `<div class="wiki-box">${wb._wikiExtract}</div>` : ''}

  <div class="section">
    <div class="section-title">Key Facts</div>
    <div class="grid">
      <div class="cell"><div class="cell-label">Capital</div><div class="cell-value">${c.capital}</div></div>
      <div class="cell"><div class="cell-label">Population</div><div class="cell-value accent">${fmtNumber(c.population)}</div></div>
      <div class="cell"><div class="cell-label">Area</div><div class="cell-value accent">${fmtArea(c.area)}</div></div>
      <div class="cell"><div class="cell-label">Calling Code</div><div class="cell-value">${c.callingCode}</div></div>
      <div class="cell"><div class="cell-label">Internet TLD</div><div class="cell-value">${c.tld}</div></div>
      <div class="cell"><div class="cell-label">UN Member</div><div class="cell-value">${c.unMember ? 'Yes' : 'No'}</div></div>
      <div class="cell"><div class="cell-label">Landlocked</div><div class="cell-value">${c.landlocked ? 'Yes' : 'No'}</div></div>
      <div class="cell"><div class="cell-label">Continents</div><div class="cell-value">${c.continents.join(', ') || '—'}</div></div>
      <div class="cell"><div class="cell-label">Timezones</div><div class="cell-value" style="font-size:11px;">${(c.timezones.slice(0,3).join(', ') || '—')}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Languages &amp; Currency</div>
    <div class="grid">
      <div class="cell" style="grid-column:1/3"><div class="cell-label">Languages</div><div class="cell-value">${c.languages.join(', ') || '—'}</div></div>
      <div class="cell"><div class="cell-label">Currency</div><div class="cell-value">${c.currencies.map(x => `${x.name} (${x.symbol||x.code})`).join(', ') || '—'}</div></div>
    </div>
  </div>

  ${wb ? `
  <div class="section">
    <div class="section-title">Economy &amp; Development (World Bank)</div>
    <div class="grid">
      <div class="cell"><div class="cell-label">GDP</div><div class="cell-value accent">${fmtWB('gdp', wb.gdp)}</div></div>
      <div class="cell"><div class="cell-label">GDP Per Capita</div><div class="cell-value accent">${fmtWB('gdpPerCapita', wb.gdpPerCapita)}</div></div>
      <div class="cell"><div class="cell-label">Pop. Density</div><div class="cell-value">${fmtWB('density', wb.density)}</div></div>
      <div class="cell"><div class="cell-label">Life Expectancy</div><div class="cell-value">${fmtWB('lifeExp', wb.lifeExp)}</div></div>
      <div class="cell"><div class="cell-label">Literacy Rate</div><div class="cell-value">${fmtWB('literacy', wb.literacy)}</div></div>
      <div class="cell"><div class="cell-label">Unemployment</div><div class="cell-value">${fmtWB('unemployment', wb.unemployment)}</div></div>
      <div class="cell"><div class="cell-label">Inflation</div><div class="cell-value">${fmtWB('inflation', wb.inflation)}</div></div>
    </div>
  </div>` : ''}

  <div class="footer">
    <span>World Explorer · worldex.app</span>
    <span>Generated ${new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})}</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) { showToast('Allow pop-ups to download PDF', 'error'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

/* ── Main render ─────────────────────────────────────────────── */
function _renderDetail(c) {
  const flag      = flagUrl(c);
  const langs     = c.languages.join(', ') || '—';
  const timezones = c.timezones.length
    ? c.timezones.slice(0,3).join(', ') + (c.timezones.length > 3 ? ` +${c.timezones.length-3} more` : '')
    : '—';
  const isHome    = AppState.homeCountry?.cca2 === c.cca2;
  const stamp     = getStamp(c.cca2);

  const neighboursHTML = c.borders.length
    ? `<div class="neighbour-list" id="neighbour-list">
        ${c.borders.map(b => `<button class="neighbour-chip" data-cca3="${b}"><span>${b}</span></button>`).join('')}
       </div>`
    : `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:var(--sp-2);">
         ${c.landlocked ? 'Landlocked country' : 'No land borders (island nation)'}
       </p>`;

  setTimeout(() => _loadNeighbourFlags(c.borders), 0);

  const page = document.getElementById('page-detail');
  if (!page) return;

  page.innerHTML = `
    <!-- Top bar: back + PDF download -->
    <div style="display:flex;align-items:center;justify-content:space-between;
                margin-bottom:var(--sp-4);gap:var(--sp-3);">
      <button class="btn-back" id="detail-back" style="margin-bottom:0;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>
      <button class="btn btn-secondary" id="pdf-download-btn"
              style="font-size:0.78rem;padding:var(--sp-2) var(--sp-4);
                     display:flex;align-items:center;gap:6px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download PDF
      </button>
    </div>

    <!-- Hero with stamp overlay -->
    <div class="detail-hero">
      <div style="position:relative;">
        <img class="detail-flag" src="${flag}" alt="Flag of ${c.name}">
        <div id="stamp-overlay-wrap">${_stampOverlayHTML(c.cca2)}</div>
      </div>
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

        <!-- Action buttons row -->
        <div style="margin-top:var(--sp-4);display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center;">
          ${isHome
            ? `<div style="display:inline-flex;align-items:center;gap:var(--sp-2);
                           background:var(--amber-ghost);border:1px solid var(--amber-dim);
                           border-radius:var(--r-full);padding:var(--sp-1) var(--sp-4);
                           font-size:0.75rem;font-family:var(--font-display);
                           font-weight:700;color:var(--amber);">🏠 Your Home Country</div>`
            : `<button class="btn btn-secondary" id="set-as-home-btn"
                       style="font-size:0.78rem;padding:var(--sp-2) var(--sp-4);">
                 🏠 Set as Home
               </button>`}
          ${_stampHTML(c.cca2)}
        </div>      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs-bar" role="tablist">
      ${['overview','geography','political','economy','culture'].map(t =>
        `<button class="tab-btn" data-tab="${t}">${_tabLabel(t)}</button>`
      ).join('')}
    </div>

    <!-- Tab: Overview -->
    <div class="tab-panel" id="tab-overview">
      <div class="section-head"><div class="section-icon">🌐</div><h3>Overview</h3></div>
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

    <!-- Tab: Geography -->
    <div class="tab-panel" id="tab-geography">
      <div class="section-head"><div class="section-icon">🗺️</div><h3>Geography</h3></div>
      <div class="info-grid">
        ${_infoCard('Latitude',   (c.latlng[0]?.toFixed(4)||'—')+'°')}
        ${_infoCard('Longitude',  (c.latlng[1]?.toFixed(4)||'—')+'°')}
        ${_infoCard('Area',       fmtArea(c.area), 'accent')}
        ${_infoCard('Landlocked', c.landlocked ? 'Yes' : 'No')}
        ${_infoCard('Continents', c.continents.join(', ')||'—')}
        ${_infoCard('Timezones',  timezones)}
      </div>
      <div class="section-head mt-4"><div class="section-icon">📍</div><h3>Map</h3></div>
      <div style="border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--border-subtle);margin-bottom:var(--sp-5);">
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

    <!-- Tab: Political (async) -->
    <div class="tab-panel" id="tab-political">
      <div class="loading-center"><div class="spinner"></div><span>Loading…</span></div>
    </div>

    <!-- Tab: Economy (async) -->
    <div class="tab-panel" id="tab-economy">
      <div class="loading-center"><div class="spinner"></div><span>Loading…</span></div>
    </div>

    <!-- Tab: Culture -->
    <div class="tab-panel" id="tab-culture">
      <div class="section-head"><div class="section-icon">🎭</div><h3>Language &amp; Culture</h3></div>
      <div class="info-grid">
        ${_infoCard('Languages',    langs)}
        ${_infoCard('Timezones',    timezones)}
        ${_infoCard('Start of Week',_cap(c.startOfWeek||'Monday'))}
        ${_infoCard('FIFA Code',    c.fifa||'—')}
        ${c.currencies.map(cur =>
          _infoCard('Currency',
            `${cur.name}<br><span style="color:var(--accent);font-weight:700;">${cur.symbol||''} ${cur.code}</span>`)
        ).join('')}
      </div>
    </div>

    <!-- Compare CTA -->
    ${AppState.homeCountry && AppState.homeCountry.cca2 !== c.cca2 ? `
      <div style="margin-top:var(--sp-8);padding:var(--sp-5);background:var(--accent-ghost);
                  border:1px solid var(--accent-dim);border-radius:var(--r-xl);text-align:center;">
        <div style="font-family:var(--font-display);font-weight:700;font-size:1rem;
                    color:var(--text-primary);margin-bottom:var(--sp-2);">
          Compare with ${AppState.homeCountry.name}
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:var(--sp-4);">
          See distance, stats comparison, and shared organisations
        </p>
        <button class="btn btn-primary" id="go-compare-btn">Compare Countries →</button>
      </div>` : ''}
  `;

  /* ── Bind events ── */
  document.getElementById('detail-back')?.addEventListener('click', _goBack);

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

  _bindStampButtons(c.cca2);

  /* PDF — fetch WB data first so the PDF is complete */
  document.getElementById('pdf-download-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('pdf-download-btn');
    if (btn) btn.textContent = '⏳ Preparing…';
    try {
      const [wb, wiki] = await Promise.all([
        loadWorldBankData(c.cca2),
        loadWikiSummary(c.name),
      ]);
      /* Attach wiki extract to wb object for convenience */
      if (wb && wiki?.extract) wb._wikiExtract = wiki.extract;
      _downloadPDF(c, wb);
    } catch {
      _downloadPDF(c, null);
    } finally {
      if (btn) {
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg> Download PDF`;
      }
    }
  });
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
  return `<div class="quick-stat"><div class="quick-stat-label">${label}</div><div class="quick-stat-value">${value}</div></div>`;
}
function _infoCard(label, value, cls='') {
  return `<div class="info-card"><div class="info-label">${label}</div><div class="info-value ${cls}">${value}</div></div>`;
}
function _tabLabel(t) {
  return { overview:'🌐 Overview', geography:'🗺️ Geo', political:'🏛️ Political',
           economy:'💰 Economy', culture:'🎭 Culture' }[t] || t;
}
function _cap(s) {
  if (!s||s==='—') return '—';
  return s.charAt(0).toUpperCase()+s.slice(1);
}
function _bbox(country) {
  const [lat, lng] = country.latlng;
  const spread = country.area > 1000000 ? 15 : country.area > 100000 ? 8 : country.area > 10000 ? 4 : 2;
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
