/* ============================================================
   World Explorer — Me Page  (js/me.js)
   Personal travel passport & stats
   Includes: share story, share rank, share footprint
   ============================================================ */

import { AppState }                    from './app.js';
import { getAllStamps, getCitizenships,
         flagUrl, fmtNumber, fmtArea } from './api.js';

const LS_FAVS   = 'worldex:favourites';
const LS_SCORES = 'worldex:hiscores2';

/* ── Entry point ─────────────────────────────────────────────── */
export function initMePage() {
  const page = document.getElementById('page-me');
  if (!page) return;

  if (!AppState.countries.length) {
    page.innerHTML = `<div class="loading-center"><div class="spinner"></div><span>Loading…</span></div>`;
    return;
  }

  _render(page);
}

/* ── Main render ─────────────────────────────────────────────── */
function _render(page) {
  const stamps       = getAllStamps();
  const citizenCca2s = getCitizenships();
  const home         = AppState.homeCountry;

  const visited  = _getTagged(stamps, 'visited');
  const wishlist = _getTagged(stamps, 'wishlist');
  const citizens = citizenCca2s.map(c => AppState.countries.find(x => x.cca2 === c)).filter(Boolean);
  const favs     = _getFavourites();
  const scores   = _getScores();

  /* Pre-compute footprint values needed for sharing */
  const allVisitedFlat = [...visited.map(v => v.country), ...(home ? [home] : [])];
  const unique         = [...new Map(allVisitedFlat.map(c => [c.cca2, c])).values()];
  const continentsArr  = [...new Set(unique.flatMap(c => c.continents || [c.region]))];

  page.innerHTML = `
    <h2 class="t-heading mb-5" style="font-size:1.25rem;">My Travel Passport</h2>

    ${_storySection(citizens, home, visited, wishlist)}
    ${_quickFactsSection(visited, wishlist)}
    ${_worldStatsSection(visited, home)}
    ${_gameStatsSection(scores)}
    ${_favouritesSection(favs)}
    ${_rankSection(scores)}

    <div style="height:var(--sp-8);"></div>
  `;

  /* ── Share: My Story + Footprint ── */
  document.getElementById('share-story-btn')?.addEventListener('click', () => {
    _shareOrCopy(_buildShareStory(citizens, home, visited, wishlist, unique, continentsArr));
  });

  /* ── Share: Geography Rank ── */
  document.getElementById('share-rank-btn')?.addEventListener('click', () => {
    const gameKeys = ['flag','capital','mystery','duel'];
    const maxTotal = 10*10 + 10*12 + 10*6 + 10;
    const total    = gameKeys.reduce((s, k) => s + (scores[k] || 0), 0);
    const pct      = maxTotal ? Math.round((total / maxTotal) * 100) : 0;
    const ranks    = [
      { min:80, title:'Geography Master',  emoji:'🏆' },
      { min:60, title:'Seasoned Explorer', emoji:'🌍' },
      { min:40, title:'Keen Traveller',    emoji:'🧭' },
      { min:20, title:'Curious Wanderer',  emoji:'🗺️' },
      { min:0,  title:'Globe Rookie',      emoji:'🌱' },
    ];
    const rank = ranks.find(r => pct >= r.min) || ranks[ranks.length - 1];
    const gameLines = [
      `🚩 Flag Flash: ${scores.flag ?? '—'}/${10*10}`,
      `🏙️ Capital Quiz: ${scores.capital ?? '—'}/${10*12}`,
      `🔍 Mystery Country: ${scores.mystery ?? '—'}/${10*6}`,
      `📏 Distance Duel: ${scores.duel ?? '—'}/10`,
    ].join('\n');
    const text = `${rank.emoji} I'm a "${rank.title}" on World Explorer!\n\nMy best scores:\n${gameLines}\n\nOverall: ${total} pts (${pct}%) 🌍\n\nCan you beat me?\n🔗https://bit.ly/SBWorldEx`;
    _shareOrCopy(text);
  });
}

/* ══════════════════════════════════════════════════════════════
   SECTION 1 — Personal story
   ══════════════════════════════════════════════════════════════ */
function _storySection(citizens, home, visited, wishlist) {
  let story = '';

  if (citizens.length === 1) {
    story += `I hold a passport of <strong>${citizens[0].name}</strong> 🛂`;
  } else if (citizens.length === 2) {
    story += `I hold the proud dual citizenship of <strong>${citizens[0].name}</strong> and <strong>${citizens[1].name}</strong> 🛂🛂`;
  }

  if (home) {
    const comma = story ? ', and I currently call ' : 'I currently call ';
    story += `${comma}<strong>${home.name}</strong> my home 🏠`;
  }

  story += story ? '. ' : '';

  if (visited.length > 0) {
    const visitedParts = visited.map(v =>
      `<strong>${v.country.name}</strong>${v.stamp.year ? ' in ' + v.stamp.year : ''}`
    );
    if (visited.length === 1) {
      story += `I've had the joy of exploring ${visitedParts[0]} ✈️. `;
    } else {
      const last = visitedParts.pop();
      story += `I've had the absolute joy of exploring ${visitedParts.join(', ')} and ${last} ✈️✨. `;
    }
  }

  if (wishlist.length > 0) {
    const wishParts = wishlist.map(w => `<strong>${w.country.name}</strong>`);
    if (wishlist.length === 1) {
      story += `And I cannot wait to discover ${wishParts[0]} very soon 🌟!`;
    } else {
      const last = wishParts.pop();
      story += `And I am absolutely itching to discover ${wishParts.join(', ')} and ${last} very soon 🌟🗺️!`;
    }
  }

  if (!story) {
    story = `Your travel story is waiting to be written! Start by setting your home country and stamping the places you've visited 🌍✨`;
  }

  const allCountries = [
    ...citizens,
    ...(home ? [home] : []),
    ...visited.map(v => v.country),
    ...wishlist.map(w => w.country),
  ];
  const unique = [...new Map(allCountries.map(c => [c.cca2, c])).values()];

  const flagStrip = unique.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-top:var(--sp-4);">
        ${unique.map(c => `
          <div title="${c.name}">
            <img src="${flagUrl(c)}" alt="${c.name}"
                 style="width:44px;height:30px;object-fit:cover;border-radius:4px;
                        box-shadow:var(--shadow-sm);border:1px solid var(--border-subtle);">
          </div>`).join('')}
       </div>` : '';

  return `
    <div class="settings-section" style="margin-bottom:var(--sp-5);">
      <div class="settings-section-title">My Story</div>
      <div style="padding:var(--sp-5);">
        <p style="font-size:1rem;color:var(--text-primary);line-height:1.85;font-weight:400;">
          ${story}
        </p>
        ${flagStrip}
        <button id="share-story-btn"
                style="margin-top:var(--sp-4);display:inline-flex;align-items:center;gap:6px;
                       background:none;border:1px solid var(--border-mid);border-radius:var(--r-full);
                       padding:6px 16px;font-family:var(--font-display);font-weight:600;
                       font-size:0.75rem;color:var(--text-secondary);cursor:pointer;
                       transition:all var(--tx-fast);"
                onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                onmouseout="this.style.borderColor='var(--border-mid)';this.style.color='var(--text-secondary)'">
          ${_shareIcon()}
          Share My Story &amp; Footprint
        </button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   SECTION 2 — Quick facts
   ══════════════════════════════════════════════════════════════ */
function _quickFactsSection(visited, wishlist) {
  const pool = [...visited.map(v => v.country), ...wishlist.map(w => w.country)];
  if (!pool.length) return '';

  const facts = [];

  pool.forEach(c => {
    if (c.population > 1e9)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> is home to over <strong>${fmtNumber(c.population)}</strong> people — more than any other country in its region.` });
    else if (c.population < 50000)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> has a population of just <strong>${fmtNumber(c.population)}</strong> — one of the smallest in the world.` });

    if (c.area > 5000000)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> covers <strong>${fmtArea(c.area)}</strong> — one of the largest countries on Earth.` });
    else if (c.area < 500)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> spans just <strong>${fmtArea(c.area)}</strong> — you could walk across it in a day!` });

    if (c.landlocked)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> is landlocked — no coastline, surrounded entirely by land.` });

    if (c.borders.length > 10)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> shares borders with <strong>${c.borders.length}</strong> countries — one of the most connected nations on the map.` });

    if (c.languages.length > 3)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> recognises <strong>${c.languages.length}</strong> official languages — a true melting pot of culture.` });

    if (c.timezones.length > 5)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> spans <strong>${c.timezones.length}</strong> time zones — breakfast in the east while it's still last night in the west!` });

    if (c.continents?.length > 1)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> spans <strong>${c.continents.length}</strong> continents — a truly transcontinental nation!` });

    if (c.unMember === false)
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> is not a UN member state — one of the world's most unique political territories.` });
  });

  if (!facts.length) {
    pool.slice(0, 3).forEach(c => {
      facts.push({ flag: flagUrl(c), text: `<strong>${c.name}</strong> is located in <strong>${c.subregion || c.region}</strong> with a capital at <strong>${c.capital}</strong>.` });
    });
  }

  const picked = _shuffle(facts).slice(0, 5);

  return `
    <div class="settings-section" style="margin-bottom:var(--sp-5);">
      <div class="settings-section-title">Did You Know?</div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        ${picked.map((f, i) => `
          <div class="settings-row" style="${i === 0 ? 'border-top:none;' : ''}">
            <div style="display:flex;align-items:flex-start;gap:var(--sp-3);width:100%;">
              <img src="${f.flag}" alt="" style="width:36px;height:24px;object-fit:cover;
                   border-radius:3px;flex-shrink:0;margin-top:2px;border:1px solid var(--border-subtle);">
              <p style="font-size:0.86rem;color:var(--text-secondary);line-height:1.65;margin:0;">
                ${f.text}
              </p>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   SECTION 3 — World footprint
   ══════════════════════════════════════════════════════════════ */
function _worldStatsSection(visited, home) {
  const allCountries = AppState.countries;
  const worldPop     = allCountries.reduce((s, c) => s + (c.population || 0), 0);
  const worldArea    = allCountries.reduce((s, c) => s + (c.area || 0), 0);

  const visitedFlat  = [...visited.map(v => v.country), ...(home ? [home] : [])];
  const unique       = [...new Map(visitedFlat.map(c => [c.cca2, c])).values()];

  const visitedPop   = unique.reduce((s, c) => s + (c.population || 0), 0);
  const visitedArea  = unique.reduce((s, c) => s + (c.area || 0), 0);
  const popPct       = worldPop  ? ((visitedPop  / worldPop)  * 100).toFixed(1) : 0;
  const areaPct      = worldArea ? ((visitedArea / worldArea) * 100).toFixed(1) : 0;

  const continents   = [...new Set(unique.flatMap(c => c.continents || [c.region]))];

  return `
    <div class="settings-section" style="margin-bottom:var(--sp-5);">
      <div class="settings-section-title">My World Footprint</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--sp-3);
                  padding:var(--sp-4) var(--sp-5);">
        <div class="stat-tile">
          <div class="stat-tile-num">${unique.length}</div>
          <div class="stat-tile-label">Countries Visited</div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-num">${continents.length}</div>
          <div class="stat-tile-label">Continents</div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-num">${popPct}%</div>
          <div class="stat-tile-label">of World Population</div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-num">${areaPct}%</div>
          <div class="stat-tile-label">of World Area</div>
        </div>
      </div>

      ${continents.length ? `
        <div style="padding:0 var(--sp-5) var(--sp-4);">
          <div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-display);
                      font-weight:600;letter-spacing:0.07em;text-transform:uppercase;
                      margin-bottom:var(--sp-2);">Continents covered</div>
          <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);">
            ${continents.map(c => `<span class="org-tag shared">${c}</span>`).join('')}
          </div>
        </div>` : ''}
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   SECTION 4 — Game stats
   ══════════════════════════════════════════════════════════════ */
function _gameStatsSection(scores) {
  const games = [
    { key:'flag',    label:'Flag Flash',      icon:'🚩', max: 10 * 10 },
    { key:'capital', label:'Capital Quiz',    icon:'🏙️', max: 10 * 12 },
    { key:'mystery', label:'Mystery Country', icon:'🔍', max: 10 * 6  },
    { key:'duel',    label:'Distance Duel',   icon:'📏', max: 10      },
  ];

  const totalPlayed = scores.played || 0;
  const cumulative  = games.reduce((s, g) => s + (scores[g.key] || 0), 0);

  return `
    <div class="settings-section" style="margin-bottom:var(--sp-5);">
      <div class="settings-section-title">Game Stats</div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--sp-3);
                  padding:var(--sp-4) var(--sp-5) var(--sp-2);">
        <div class="stat-tile">
          <div class="stat-tile-num">${totalPlayed}</div>
          <div class="stat-tile-label">Games Played</div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-num">${cumulative}</div>
          <div class="stat-tile-label">Cumulative Score</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:2px;padding-bottom:var(--sp-2);">
        ${games.map((g, i) => {
          const best = scores[g.key] ?? null;
          const pct  = best != null ? Math.round((best / g.max) * 100) : 0;
          return `
            <div class="settings-row" style="${i === 0 ? 'border-top:none;' : ''}">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;
                            margin-bottom:var(--sp-2);">
                  <div style="display:flex;align-items:center;gap:var(--sp-2);">
                    <span style="font-size:1rem;">${g.icon}</span>
                    <span style="font-family:var(--font-display);font-weight:600;
                                 font-size:0.85rem;color:var(--text-primary);">${g.label}</span>
                  </div>
                  <div style="font-family:var(--font-display);font-weight:800;
                              font-size:0.9rem;color:var(--accent);">
                    ${best ?? '—'} <span style="font-size:0.68rem;color:var(--text-muted);font-weight:500;">/ ${g.max}</span>
                  </div>
                </div>
                <div style="height:5px;background:var(--bg-overlay);border-radius:var(--r-full);overflow:hidden;">
                  <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--amber));
                              border-radius:var(--r-full);transition:width 800ms ease;"></div>
                </div>
                <div style="font-size:0.65rem;color:var(--text-muted);margin-top:3px;
                            font-family:var(--font-display);font-weight:600;">${pct}% best accuracy</div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   SECTION 5 — Favourite countries
   ══════════════════════════════════════════════════════════════ */
function _favouritesSection(favs) {
  if (!favs.length) return '';
  return `
    <div class="settings-section" style="margin-bottom:var(--sp-5);">
      <div class="settings-section-title">My Favourites ★</div>
      <div style="display:flex;flex-wrap:wrap;gap:var(--sp-3);padding:var(--sp-4) var(--sp-5);">
        ${favs.map(c => `
          <div style="display:flex;align-items:center;gap:var(--sp-2);
                      background:var(--bg-raised);border:1px solid var(--border-subtle);
                      border-radius:var(--r-full);padding:var(--sp-1) var(--sp-3) var(--sp-1) var(--sp-1);">
            <img src="${flagUrl(c)}" alt="${c.name}"
                 style="width:28px;height:19px;object-fit:cover;border-radius:3px;flex-shrink:0;">
            <span style="font-family:var(--font-display);font-weight:600;
                         font-size:0.78rem;color:var(--text-primary);">${c.name}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   SECTION 6 — Geography rank
   ══════════════════════════════════════════════════════════════ */
function _rankSection(scores) {
  const gameKeys = ['flag','capital','mystery','duel'];
  const maxTotal = 10*10 + 10*12 + 10*6 + 10;
  const total    = gameKeys.reduce((s, k) => s + (scores[k] || 0), 0);
  const pct      = maxTotal ? (total / maxTotal) * 100 : 0;

  const ranks = [
    { min:80, title:'Geography Master',  emoji:'🏆', desc:'You know this planet like the back of your hand. Absolutely elite.' },
    { min:60, title:'Seasoned Explorer', emoji:'🌍', desc:'You\'ve got serious world knowledge and an adventurous spirit.' },
    { min:40, title:'Keen Traveller',    emoji:'🧭', desc:'You\'re curious, growing, and ready for more adventures.' },
    { min:20, title:'Curious Wanderer',  emoji:'🗺️', desc:'The world is calling and you\'re just getting started!' },
    { min:0,  title:'Globe Rookie',      emoji:'🌱', desc:'Every great explorer starts somewhere. Your journey begins now!' },
  ];

  const rank = ranks.find(r => pct >= r.min) || ranks[ranks.length - 1];

  return `
    <div class="settings-section" style="margin-bottom:var(--sp-5);">
      <div class="settings-section-title">My Geography Rank</div>
      <div style="padding:var(--sp-5);text-align:center;">
        <div style="font-size:3.5rem;margin-bottom:var(--sp-3);">${rank.emoji}</div>
        <div style="font-family:var(--font-display);font-weight:800;font-size:1.4rem;
                    letter-spacing:-0.02em;color:var(--text-primary);margin-bottom:var(--sp-2);">
          ${rank.title}
        </div>
        <p style="font-size:0.86rem;color:var(--text-secondary);line-height:1.6;
                  max-width:280px;margin:0 auto var(--sp-5);">${rank.desc}</p>

        <div style="background:var(--bg-raised);border-radius:var(--r-lg);
                    padding:var(--sp-4);display:inline-block;min-width:200px;
                    margin-bottom:var(--sp-4);">
          <div style="height:6px;background:var(--bg-overlay);border-radius:var(--r-full);
                      overflow:hidden;margin-bottom:var(--sp-2);">
            <div style="width:${Math.min(pct,100).toFixed(1)}%;height:100%;
                        background:linear-gradient(90deg,var(--accent),var(--amber));
                        border-radius:var(--r-full);"></div>
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-display);
                      font-weight:600;">Overall score: ${total} / ${maxTotal}</div>
        </div>

        <div>
          <button id="share-rank-btn"
                  style="display:inline-flex;align-items:center;gap:6px;
                         background:none;border:1px solid var(--border-mid);
                         border-radius:var(--r-full);padding:8px 20px;
                         font-family:var(--font-display);font-weight:600;
                         font-size:0.78rem;color:var(--text-secondary);cursor:pointer;
                         transition:all var(--tx-fast);"
                  onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                  onmouseout="this.style.borderColor='var(--border-mid)';this.style.color='var(--text-secondary)'">
            ${_shareIcon()}
            Share My Rank
          </button>
        </div>
      </div>
    </div>`;
}

/* ── Share helpers ───────────────────────────────────────────── */
function _buildShareStory(citizens, home, visited, wishlist, unique, continents) {
  const lines = [];

  if (citizens.length === 1)
    lines.push(`🛂 Citizen of ${citizens[0].name}`);
  else if (citizens.length === 2)
    lines.push(`🛂 Dual citizen of ${citizens[0].name} & ${citizens[1].name}`);

  if (home)
    lines.push(`🏠 Currently living in ${home.name}`);

  if (visited.length)
    lines.push(`✈️ Visited: ${visited.map(v =>
      v.country.name + (v.stamp.year ? ' (' + v.stamp.year + ')' : '')
    ).join(', ')}`);

  if (wishlist.length)
    lines.push(`⭐ Wish list: ${wishlist.map(w => w.country.name).join(', ')}`);

  lines.push('');
  lines.push(`🌍 ${unique.length} countr${unique.length === 1 ? 'y' : 'ies'} · ${continents.length} continent${continents.length === 1 ? '' : 's'}`);
  lines.push('');
  lines.push('Explored on World Explorer 🗺️');
  lines.push('🔗 Share your own footprints https://bit.ly/SBWorldEx');

  return lines.join('\n');
}

function _shareOrCopy(text) {
  if (navigator.share) {
    navigator.share({ title: 'World Explorer', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text)
      .then(() => {
        import('./app.js').then(({ showToast }) =>
          showToast('Copied to clipboard! 📋', 'success')
        );
      })
      .catch(() => {
        import('./app.js').then(({ showToast }) =>
          showToast('Could not share — try copying manually', 'error')
        );
      });
  }
}

function _shareIcon() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>`;
}

/* ── Data helpers ────────────────────────────────────────────── */
function _getTagged(stamps, type) {
  return Object.entries(stamps)
    .filter(([, v]) => {
      const t = typeof v === 'string' ? v : v?.type;
      return t === type;
    })
    .map(([cca2, v]) => ({
      country: AppState.countries.find(c => c.cca2 === cca2),
      stamp:   typeof v === 'string' ? { type: v } : v,
    }))
    .filter(x => x.country);
}

function _getFavourites() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_FAVS) || '[]');
    return raw.map(cca2 => AppState.countries.find(c => c.cca2 === cca2)).filter(Boolean);
  } catch { return []; }
}

function _getScores() {
  try { return JSON.parse(localStorage.getItem(LS_SCORES) || '{}'); }
  catch { return {}; }
}

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
