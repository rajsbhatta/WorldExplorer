/* ============================================================
   World Explorer — Games  (js/games.js)

   Game 1: Flag Flash      — guess country from flag (timed)
   Game 2: Distance Duel   — which country is closer to home?
   Game 3: Capital Quiz    — guess the capital city
   Game 4: Mystery Country — clue-by-clue country deduction

   High scores stored in localStorage (worldex:hiscores2) —
   separate from the API cache so they survive cache clears
   and app updates.
   ============================================================ */

import { AppState, showToast, openHomePicker } from './app.js';
import { flagUrl, haversine }                  from './api.js';

/* ── Constants ───────────────────────────────────────────────── */
const ROUNDS       = 10;
const FLAG_TIMER_S = 10;
const LS_SCORES    = 'worldex:hiscores2';

/* ── State ───────────────────────────────────────────────────── */
let _initialised = false;
let _activeGame  = null;
let _round       = 0;
let _score       = 0;
let _timerHandle = null;
let _timerLeft   = FLAG_TIMER_S;
let _answered    = false;
let _pool        = [];

/* mystery state */
let _mysteryCountry   = null;
let _mysteryClueIndex = 0;
let _mysteryGuessed   = false;

/* ══════════════════════════════════════════════════════════════
   PAGE SHELL
   ══════════════════════════════════════════════════════════════ */

export function initGamesPage() {
  if (_initialised) { _renderLobby(); return; }
  _initialised = true;
  _buildPage();
}

function _buildPage() {
  const page = document.getElementById('page-games');
  if (!page) return;
  page.innerHTML = `
    <div id="games-lobby"></div>
    <div id="game-arena"></div>`;
  _renderLobby();
}

function _renderLobby() {
  const lobby = document.getElementById('games-lobby');
  const arena = document.getElementById('game-arena');
  if (lobby) lobby.style.display = 'block';
  if (arena) { arena.innerHTML = ''; arena.classList.remove('active'); }
  _stopTimer();
  _activeGame = null;

  const scores = _loadScores();
  const scoreItems = [
    { label:'Flag Flash',      val: scores.flag     ?? '—', icon:'🚩' },
    { label:'Capital Quiz',    val: scores.capital  ?? '—', icon:'🏙️' },
    { label:'Mystery Country', val: scores.mystery  ?? '—', icon:'🔍' },
    { label:'Distance Duel',   val: scores.duel     ?? '—', icon:'📏' },
    { label:'Games Played',    val: scores.played   ?? 0,   icon:'🎮' },
  ];

  lobby.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
                gap:var(--sp-3);margin-bottom:var(--sp-2);flex-wrap:wrap;">
      <h2 class="t-heading" style="font-size:1.25rem;">Geography Games</h2>
      <button id="reset-scores-btn"
              style="background:none;border:1px solid var(--border-mid);
                     border-radius:var(--r-full);padding:5px 14px;
                     font-family:var(--font-display);font-weight:600;
                     font-size:0.7rem;letter-spacing:0.04em;color:var(--text-muted);
                     cursor:pointer;transition:all var(--tx-fast);"
              onmouseover="this.style.borderColor='var(--coral)';this.style.color='var(--coral)'"
              onmouseout="this.style.borderColor='var(--border-mid)';this.style.color='var(--text-muted)'">
        Reset Scores
      </button>
    </div>
    <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:var(--sp-5);">
      4 games · all data loaded locally · no extra downloads
    </p>

    <!-- High score strip -->
    <div style="display:flex;gap:var(--sp-3);margin-bottom:var(--sp-5);
                overflow-x:auto;scrollbar-width:none;padding-bottom:4px;">
      ${scoreItems.map(i => `
        <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);
                    border-radius:var(--r-lg);padding:var(--sp-3) var(--sp-4);
                    flex-shrink:0;text-align:center;min-width:88px;">
          <div style="font-size:1.1rem;margin-bottom:3px;">${i.icon}</div>
          <div style="font-family:var(--font-display);font-weight:800;font-size:1.1rem;
                      color:var(--accent);">${i.val}</div>
          <div style="font-size:0.6rem;color:var(--text-muted);font-family:var(--font-display);
                      font-weight:600;letter-spacing:0.05em;text-transform:uppercase;
                      margin-top:2px;">${i.label}</div>
        </div>`).join('')}
    </div>

    <!-- Game cards -->
    <div class="games-grid">

      <div class="game-card flag-game" id="start-flag-game">
        <div class="game-emoji">🚩</div>
        <div class="game-title">Flag Flash</div>
        <div class="game-desc">A flag appears — name the country before 10 seconds run out. Speed = more points!</div>
        <div class="game-meta"><span>⏱ 10s/round</span><span>🎯 ${ROUNDS} rounds</span></div>
      </div>

      <div class="game-card" style="cursor:pointer;" id="start-capital-game">
        <div class="game-emoji">🏙️</div>
        <div class="game-title">Capital Quiz</div>
        <div class="game-desc">A country is shown — pick its capital city from 4 options. Nur-Sultan or Astana?</div>
        <div class="game-meta"><span>⏱ 12s/round</span><span>🎯 ${ROUNDS} rounds</span></div>
      </div>

      <div class="game-card" style="cursor:pointer;background:var(--bg-surface);" id="start-mystery-game">
        <div class="game-emoji">🔍</div>
        <div class="game-title">Mystery Country</div>
        <div class="game-desc">Clues revealed one by one — continent, region, population, neighbours, capital. Guess early for max points!</div>
        <div class="game-meta"><span>💡 Up to 6 clues</span><span>🎯 ${ROUNDS} rounds</span></div>
      </div>

      <div class="game-card dist-game" id="start-duel-game">
        <div class="game-emoji">📏</div>
        <div class="game-title">Distance Duel</div>
        <div class="game-desc">Two countries — which is closer to your home? Trust your geographical intuition!</div>
        <div class="game-meta"><span>🏠 Needs home country</span><span>🎯 ${ROUNDS} rounds</span></div>
      </div>

    </div>`;

  document.getElementById('start-flag-game')    ?.addEventListener('click', _startFlagGame);
  document.getElementById('start-capital-game') ?.addEventListener('click', _startCapitalGame);
  document.getElementById('start-mystery-game') ?.addEventListener('click', _startMysteryGame);
  document.getElementById('start-duel-game')   ?.addEventListener('click', () => {
    if (!AppState.homeCountry) { showToast('Please set your home country first!','info'); openHomePicker(); return; }
    _startDuelGame();
  });

  document.getElementById('reset-scores-btn')?.addEventListener('click', () => {
    if (!confirm('Reset all your high scores? This cannot be undone.')) return;
    resetScores();
    _renderLobby();   /* re-render lobby to show cleared scores */
    showToast('Scores reset', 'info');
  });
}

/* ══════════════════════════════════════════════════════════════
   GAME 1 — FLAG FLASH
   ══════════════════════════════════════════════════════════════ */
function _startFlagGame() {
  _activeGame = 'flag'; _round = 0; _score = 0;
  _pool = _shuffled(AppState.countries.filter(c => c.cca2));
  _showArena(); _nextFlagRound();
}

function _nextFlagRound() {
  if (_round >= ROUNDS) { _endGame('flag'); return; }
  _round++; _answered = false; _timerLeft = FLAG_TIMER_S;
  const correct = _pool[_round - 1];
  const options  = _pickOptions(correct, 4);
  _arenaHTML(`
    ${_hud()}
    ${_timerBar()}
    <img class="flag-display" src="${flagUrl(correct)}" alt="Mystery flag">
    <div class="game-question">Which country does this flag belong to?</div>
    <div class="options-grid" id="opts">
      ${options.map(c => `
        <button class="option-btn" data-cca2="${c.cca2}" data-correct="${c.cca2===correct.cca2}">
          ${c.name}
        </button>`).join('')}
    </div>
    <div id="round-feedback" style="text-align:center;min-height:28px;
         font-family:var(--font-display);font-weight:700;font-size:0.92rem;"></div>`);
  _bindOptions(correct, _onFlagTimeout.bind(null, correct));
  _startTimer(() => _onFlagTimeout(correct));
}

function _onFlagTimeout(correct) {
  if (_answered) return; _answered = true;
  document.querySelectorAll('.option-btn').forEach(b => {
    b.disabled = true;
    if (b.dataset.correct === 'true') b.classList.add('correct');
  });
  _showFeedback(`⏱ Time's up! It was ${correct.name}`, 'var(--amber)');
  setTimeout(_nextFlagRound, 1600);
}

function _bindOptions(correct, onTimeout) {
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_answered) return; _answered = true; _stopTimer();
      const ok = btn.dataset.correct === 'true';
      if (ok) {
        _score += Math.max(1, _timerLeft);
        btn.classList.add('correct');
        _showFeedback(`✓ Correct! +${Math.max(1, _timerLeft)} pts`, 'var(--green)');
      } else {
        btn.classList.add('wrong');
        document.querySelectorAll('.option-btn').forEach(b => {
          if (b.dataset.correct === 'true') b.classList.add('correct');
        });
        _showFeedback(`✗ It was ${correct.name}`, 'var(--coral)');
      }
      document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
      setTimeout(_nextFlagRound, 1600);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   GAME 3 — CAPITAL QUIZ
   ══════════════════════════════════════════════════════════════ */
const CAP_TIMER_S = 12;

function _startCapitalGame() {
  _activeGame = 'capital'; _round = 0; _score = 0;
  _pool = _shuffled(AppState.countries.filter(c => c.capital && c.capital !== '—'));
  _showArena(); _nextCapitalRound();
}

function _nextCapitalRound() {
  if (_round >= ROUNDS) { _endGame('capital'); return; }
  _round++; _answered = false; _timerLeft = CAP_TIMER_S;
  const correct = _pool[_round - 1];

  /* 3 wrong capitals from other countries */
  const wrongs = _shuffled(
    AppState.countries.filter(c => c.cca2 !== correct.cca2 && c.capital && c.capital !== '—')
  ).slice(0, 3).map(c => c.capital);

  const options = _shuffled([correct.capital, ...wrongs]);

  _arenaHTML(`
    ${_hud()}
    ${_timerBar(CAP_TIMER_S)}
    <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);
                border-radius:var(--r-xl);padding:var(--sp-6);margin-bottom:var(--sp-5);
                text-align:center;">
      <img src="${flagUrl(correct)}" alt="${correct.name}"
           style="height:52px;border-radius:var(--r-sm);box-shadow:var(--shadow-sm);
                  margin-bottom:var(--sp-4);display:inline-block;">
      <div style="font-family:var(--font-display);font-weight:800;font-size:1.4rem;
                  letter-spacing:-0.02em;color:var(--text-primary);">${correct.name}</div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${correct.region}</div>
    </div>
    <div class="game-question">What is the capital city of ${correct.name}?</div>
    <div class="options-grid" id="opts">
      ${options.map(cap => `
        <button class="option-btn" data-val="${cap}" data-correct="${cap===correct.capital}">
          ${cap}
        </button>`).join('')}
    </div>
    <div id="round-feedback" style="text-align:center;min-height:28px;
         font-family:var(--font-display);font-weight:700;font-size:0.92rem;"></div>`);

  /* bind manually (options are capitals not countries) */
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_answered) return; _answered = true; _stopTimer();
      const ok = btn.dataset.correct === 'true';
      if (ok) {
        _score += Math.max(1, _timerLeft);
        btn.classList.add('correct');
        _showFeedback(`✓ Correct! +${Math.max(1, _timerLeft)} pts`, 'var(--green)');
      } else {
        btn.classList.add('wrong');
        document.querySelectorAll('.option-btn').forEach(b => {
          if (b.dataset.correct === 'true') b.classList.add('correct');
        });
        _showFeedback(`✗ Capital is ${correct.capital}`, 'var(--coral)');
      }
      document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
      setTimeout(_nextCapitalRound, 1600);
    });
  });

  _startTimer(() => {
    if (_answered) return; _answered = true;
    document.querySelectorAll('.option-btn').forEach(b => {
      b.disabled = true;
      if (b.dataset.correct === 'true') b.classList.add('correct');
    });
    _showFeedback(`⏱ Time's up! Capital is ${correct.capital}`, 'var(--amber)');
    setTimeout(_nextCapitalRound, 1600);
  }, CAP_TIMER_S);
}

/* ══════════════════════════════════════════════════════════════
   GAME 4 — MYSTERY COUNTRY
   Reveal clues one by one; guess with fewest clues for max pts
   Max points: 6 (guess on clue 1) → 1 (guess on clue 6)
   ══════════════════════════════════════════════════════════════ */

function _startMysteryGame() {
  _activeGame = 'mystery'; _round = 0; _score = 0;
  _pool = _shuffled(AppState.countries.filter(c => c.cca2));
  _showArena(); _nextMysteryRound();
}

function _buildClues(c) {
  const pop = c.population > 1e9 ? 'Over 1 billion people'
            : c.population > 1e8 ? 'Over 100 million people'
            : c.population > 5e7 ? 'Over 50 million people'
            : c.population > 1e7 ? 'Over 10 million people'
            : c.population > 1e6 ? 'Over 1 million people'
            : 'Under 1 million people';

  const area = c.area > 1e7 ? 'One of the largest countries on Earth'
             : c.area > 1e6 ? 'A very large country'
             : c.area > 1e5 ? 'A medium-sized country'
             : c.area > 1e4 ? 'A relatively small country'
             : 'A very small country';

  const neighbours = c.borders.length
    ? `Shares a border with ${c.borders.length} countr${c.borders.length > 1 ? 'ies' : 'y'}`
    : c.landlocked ? 'Landlocked with no coastal access'
    : 'An island nation or has no land borders';

  const clues = [
    { icon:'🌍', label:'Continent',   text: c.continents.join(', ') || c.region },
    { icon:'📍', label:'Region',      text: c.subregion || c.region },
    { icon:'👥', label:'Population',  text: pop },
    { icon:'📐', label:'Size',        text: area },
    { icon:'🤝', label:'Neighbours',  text: neighbours },
    { icon:'🏛️', label:'Capital hint',text: `Capital starts with "${(c.capital||'?')[0]}"` },
  ];
  return clues;
}

function _nextMysteryRound() {
  if (_round >= ROUNDS) { _endGame('mystery'); return; }
  _round++;
  _answered = false;
  _mysteryCountry   = _pool[_round - 1];
  _mysteryClueIndex = 0;
  _mysteryGuessed   = false;
  _renderMysteryRound();
}

function _renderMysteryRound() {
  const c      = _mysteryCountry;
  const clues  = _buildClues(c);
  const shown  = clues.slice(0, _mysteryClueIndex + 1);
  const pts    = Math.max(1, clues.length - _mysteryClueIndex);

  _arenaHTML(`
    ${_hud()}

    <!-- Points indicator -->
    <div style="text-align:center;margin-bottom:var(--sp-4);">
      <div style="display:inline-flex;align-items:center;gap:var(--sp-2);
                  background:var(--amber-ghost);border:1px solid var(--amber-dim);
                  border-radius:var(--r-full);padding:var(--sp-1) var(--sp-4);">
        <span style="font-family:var(--font-display);font-weight:800;
                     font-size:1rem;color:var(--amber);">${pts}</span>
        <span style="font-size:0.72rem;color:var(--text-muted);
                     font-family:var(--font-display);font-weight:600;">
          pts if you guess now
        </span>
      </div>
    </div>

    <!-- Clues revealed so far -->
    <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);
                border-radius:var(--r-xl);padding:var(--sp-4);margin-bottom:var(--sp-4);">
      ${shown.map((cl, i) => `
        <div style="display:flex;align-items:flex-start;gap:var(--sp-3);
                    ${i > 0 ? 'margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:1px solid var(--border-subtle);' : ''}
                    animation:fadeUp 300ms ease both;">
          <div style="width:32px;height:32px;background:var(--bg-overlay);
                      border-radius:var(--r-sm);display:grid;place-items:center;
                      font-size:16px;flex-shrink:0;">${cl.icon}</div>
          <div>
            <div style="font-size:0.62rem;color:var(--text-muted);font-family:var(--font-display);
                        font-weight:600;letter-spacing:0.07em;text-transform:uppercase;">
              Clue ${i + 1} · ${cl.label}
            </div>
            <div style="font-family:var(--font-display);font-weight:700;
                        font-size:0.95rem;color:var(--text-primary);margin-top:2px;">
              ${cl.text}
            </div>
          </div>
        </div>`).join('')}
    </div>

    <!-- Input area -->
    ${_mysteryGuessed ? '' : `
      <div style="display:flex;flex-direction:column;gap:var(--sp-3);">
        <div style="position:relative;">
          <input id="mystery-input" class="search-input" type="text"
                 placeholder="Type country name…" autocomplete="off"
                 style="padding-left:var(--sp-4);">
          <div id="mystery-suggestions"
               style="position:absolute;top:100%;left:0;right:0;z-index:10;
                      background:var(--bg-surface);border:1px solid var(--border-mid);
                      border-radius:var(--r-md);margin-top:4px;max-height:180px;
                      overflow-y:auto;display:none;">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);">
          ${_mysteryClueIndex < clues.length - 1 ? `
            <button class="btn btn-secondary" id="mystery-next-clue">
              Next Clue (−1 pt)
            </button>` : '<div></div>'}
          <button class="btn btn-primary" id="mystery-submit">
            Guess →
          </button>
        </div>
      </div>
    `}

    <div id="round-feedback" style="text-align:center;min-height:28px;margin-top:var(--sp-3);
         font-family:var(--font-display);font-weight:700;font-size:0.92rem;"></div>
  `);

  _bindMysteryEvents(clues);
}

function _bindMysteryEvents(clues) {
  const input       = document.getElementById('mystery-input');
  const suggestions = document.getElementById('mystery-suggestions');
  const submitBtn   = document.getElementById('mystery-submit');
  const nextClueBtn = document.getElementById('mystery-next-clue');

  /* Autocomplete suggestions */
  input?.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q || q.length < 1) { if(suggestions) suggestions.style.display = 'none'; return; }
    const matches = AppState.countries
      .filter(c => c.name.toLowerCase().startsWith(q))
      .slice(0, 6);
    if (!matches.length) { if(suggestions) suggestions.style.display = 'none'; return; }
    suggestions.innerHTML = matches.map(c => `
      <button style="display:flex;align-items:center;gap:var(--sp-3);
                     width:100%;background:none;border:none;padding:var(--sp-3);
                     cursor:pointer;text-align:left;transition:background var(--tx-fast);"
              class="mystery-sug" data-name="${c.name}"
              onmouseover="this.style.background='var(--bg-raised)'"
              onmouseout="this.style.background='none'">
        <img src="${flagUrl(c)}" width="24" height="16"
             style="border-radius:2px;object-fit:cover;flex-shrink:0;">
        <span style="font-family:var(--font-display);font-weight:600;
                     font-size:0.85rem;color:var(--text-primary);">${c.name}</span>
      </button>`).join('');
    suggestions.style.display = 'block';

    suggestions.querySelectorAll('.mystery-sug').forEach(btn => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.name;
        suggestions.style.display = 'none';
      });
    });
  });

  /* Submit guess */
  submitBtn?.addEventListener('click', () => _checkMysteryGuess(input?.value || '', clues));

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _checkMysteryGuess(input.value, clues);
  });

  /* Next clue */
  nextClueBtn?.addEventListener('click', () => {
    if (_mysteryClueIndex < clues.length - 1) {
      _mysteryClueIndex++;
      _renderMysteryRound();
    }
  });
}

function _checkMysteryGuess(guess, clues) {
  if (_mysteryGuessed) return;
  const correct = _mysteryCountry;
  const norm    = s => s.toLowerCase().trim();
  const ok      = norm(guess) === norm(correct.name) ||
                  norm(guess) === norm(correct.officialName);

  _mysteryGuessed = true;
  const pts = ok ? Math.max(1, clues.length - _mysteryClueIndex) : 0;
  _score += pts;

  /* Hide suggestions */
  const sug = document.getElementById('mystery-suggestions');
  if (sug) sug.style.display = 'none';

  if (ok) {
    _showFeedback(`✓ Correct! +${pts} pts`, 'var(--green)');
  } else {
    _showFeedback(`✗ It was ${correct.name}`, 'var(--coral)');
    /* Reveal flag */
    const arena = document.getElementById('game-arena');
    const reveal = document.createElement('div');
    reveal.style.cssText = 'text-align:center;margin-top:var(--sp-4);animation:fadeUp 300ms ease both;';
    reveal.innerHTML = `
      <img src="${flagUrl(correct)}" alt="${correct.name}"
           style="height:60px;border-radius:var(--r-sm);box-shadow:var(--shadow-md);">
      <div style="font-family:var(--font-display);font-weight:700;
                  font-size:0.9rem;color:var(--text-secondary);margin-top:var(--sp-2);">
        ${correct.name} · Capital: ${correct.capital}
      </div>`;
    arena?.appendChild(reveal);
  }

  /* Update score in HUD */
  const scoreEl = document.querySelector('.game-score');
  if (scoreEl) scoreEl.innerHTML = `${_score} <span style="font-size:.9rem;color:var(--text-muted);">pts</span>`;

  setTimeout(_nextMysteryRound, ok ? 1400 : 2200);
}

/* ══════════════════════════════════════════════════════════════
   GAME 2 — DISTANCE DUEL
   ══════════════════════════════════════════════════════════════ */
function _startDuelGame() {
  _activeGame = 'duel'; _round = 0; _score = 0;
  _pool = _shuffled(AppState.countries.filter(c =>
    c.cca2 !== AppState.homeCountry?.cca2 && c.cca2
  ));
  _showArena(); _nextDuelRound();
}

function _nextDuelRound() {
  if (_round >= ROUNDS) { _endGame('duel'); return; }
  _round++; _answered = false;
  const home     = AppState.homeCountry;
  const countryA = _pool[((_round-1)*2)   % _pool.length];
  const countryB = _pool[((_round-1)*2+1) % _pool.length];
  const distA    = haversine(home.latlng[0], home.latlng[1], countryA.latlng[0], countryA.latlng[1]);
  const distB    = haversine(home.latlng[0], home.latlng[1], countryB.latlng[0], countryB.latlng[1]);
  const closer   = distA < distB ? 'A' : 'B';

  _arenaHTML(`
    ${_hud()}
    <div class="game-question" style="margin-bottom:var(--sp-4);">
      Which country is <span style="color:var(--accent);font-weight:800;">closer</span>
      to <span style="color:var(--amber);">${home.name}</span>?
    </div>
    <div style="text-align:center;margin-bottom:var(--sp-4);">
      <img src="${flagUrl(home)}" alt="${home.name}"
           style="height:34px;border-radius:4px;box-shadow:var(--shadow-sm);
                  border:2px solid var(--amber-dim);">
      <div style="font-size:0.68rem;color:var(--amber);margin-top:3px;
                  font-family:var(--font-display);font-weight:600;letter-spacing:0.05em;">HOME</div>
    </div>
    <div class="duel-flags" id="duel-options">
      ${_duelOptionHTML(countryA,'A',distA)}
      ${_duelOptionHTML(countryB,'B',distB)}
    </div>
    <div id="round-feedback" style="text-align:center;min-height:28px;
         font-family:var(--font-display);font-weight:700;font-size:0.92rem;"></div>`);

  _bindDuelOptions(countryA, countryB, distA, distB, closer);
}

function _duelOptionHTML(country, slot, dist) {
  return `
    <button class="duel-option" data-slot="${slot}" data-dist="${dist}">
      <img class="duel-flag-img" src="${flagUrl(country)}" alt="${country.name}">
      <div class="duel-country-name">${country.name}</div>
      <div class="duel-dist-reveal">${dist.toLocaleString()} km away</div>
    </button>`;
}

function _bindDuelOptions(cA, cB, distA, distB, closer) {
  document.querySelectorAll('.duel-option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_answered) return; _answered = true;
      const ok = btn.dataset.slot === closer;
      if (ok) { _score++; btn.classList.add('correct'); _showFeedback('✓ Correct! +1 pt', 'var(--green)'); }
      else { btn.classList.add('wrong'); document.querySelectorAll('.duel-option').forEach(b => { if (b.dataset.slot === closer) b.classList.add('correct'); }); _showFeedback('✗ Wrong direction!', 'var(--coral)'); }
      document.querySelectorAll('.duel-option').forEach(b => { b.classList.add('revealed'); b.disabled = true; });
      setTimeout(_nextDuelRound, 2000);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   SHARED — TIMER, END SCREEN, UTILS
   ══════════════════════════════════════════════════════════════ */

function _startTimer(onExpire, seconds = FLAG_TIMER_S) {
  _stopTimer();
  _timerLeft = seconds;
  _updateTimerBar(seconds);
  _timerHandle = setInterval(() => {
    _timerLeft--;
    _updateTimerBar(seconds);
    if (_timerLeft <= 0) { _stopTimer(); onExpire(); }
  }, 1000);
}

function _stopTimer() {
  if (_timerHandle) { clearInterval(_timerHandle); _timerHandle = null; }
}

function _updateTimerBar(total = FLAG_TIMER_S) {
  const fill = document.getElementById('timer-fill');
  if (!fill) return;
  const pct = (_timerLeft / total) * 100;
  fill.style.width = pct + '%';
  fill.style.background = pct > 50
    ? 'linear-gradient(90deg,var(--accent),var(--accent-mid))'
    : pct > 25
      ? 'linear-gradient(90deg,var(--amber),var(--amber-mid))'
      : 'linear-gradient(90deg,var(--coral),var(--coral-mid))';
}

function _showFeedback(msg, colour) {
  const el = document.getElementById('round-feedback');
  if (!el) return;
  el.textContent = msg; el.style.color = colour; el.style.opacity = '1';
}

function _showArena() {
  const lobby = document.getElementById('games-lobby');
  const arena = document.getElementById('game-arena');
  if (lobby) lobby.style.display = 'none';
  if (arena) { arena.classList.add('active'); arena.innerHTML = ''; }
}

function _arenaHTML(html) {
  const arena = document.getElementById('game-arena');
  if (arena) arena.innerHTML = html;
  document.getElementById('quit-btn')?.addEventListener('click', _renderLobby);
}

function _endGame(gameType) {
  _stopTimer();
  const maxMap = { flag: ROUNDS * FLAG_TIMER_S, capital: ROUNDS * CAP_TIMER_S, mystery: ROUNDS * 6, duel: ROUNDS };
  const max    = maxMap[gameType] || ROUNDS;
  const pct    = Math.round((_score / max) * 100);
  const emoji  = pct >= 80 ? '🏆' : pct >= 50 ? '🌍' : pct >= 30 ? '🗺️' : '📚';
  const msg    = pct >= 80 ? 'Geography master!' : pct >= 50 ? 'Solid world knowledge!' : pct >= 30 ? 'Keep exploring!' : 'The world awaits you!';

  const scores = _loadScores();
  if (scores[gameType] == null || _score > scores[gameType]) scores[gameType] = _score;
  scores.played = (scores.played || 0) + 1;
  _saveScores(scores);

  const gameTitles = { flag:'Flag Flash', capital:'Capital Quiz', mystery:'Mystery Country', duel:'Distance Duel' };
  const arena = document.getElementById('game-arena');
  if (!arena) return;

  arena.innerHTML = `
    <div class="game-over">
      <div class="game-over-emoji">${emoji}</div>
      <div class="game-over-score">${_score}</div>
      <div class="game-over-label">out of ${max} points · ${gameTitles[gameType]}</div>
      <div class="game-over-msg">${msg}</div>

      <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);
                  border-radius:var(--r-xl);padding:var(--sp-5);margin-bottom:var(--sp-6);
                  display:inline-block;min-width:240px;">
        <div style="display:flex;justify-content:space-between;gap:var(--sp-6);margin-bottom:var(--sp-3);">
          ${_statBox('Score', _score, 'var(--accent)')}
          ${_statBox('Rounds', ROUNDS, 'var(--text-primary)')}
          ${_statBox('Best', scores[gameType], 'var(--amber)')}
        </div>
        <div style="background:var(--bg-overlay);border-radius:var(--r-full);height:5px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;border-radius:var(--r-full);
                      background:linear-gradient(90deg,var(--accent),var(--amber));
                      transition:width 800ms cubic-bezier(0.16,1,0.3,1);"></div>
        </div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:var(--sp-2);
                    font-family:var(--font-display);font-weight:600;">${pct}% accuracy</div>
      </div>
      
      <div style="display:flex;flex-direction:column;gap:var(--sp-3);max-width:260px;margin:0 auto;">
        <button class="btn btn-primary btn-full" id="play-again-btn">Play Again</button>
        <button class="btn btn-secondary btn-full" id="share-result-btn"
                style="display:flex;align-items:center;justify-content:center;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          Share Result
        </button>
        <button class="btn btn-ghost btn-full" id="back-lobby-btn">← All Games</button>
      </div>
    </div>`;

  const restarters = { flag:_startFlagGame, capital:_startCapitalGame, mystery:_startMysteryGame, duel:_startDuelGame };
  document.getElementById('play-again-btn')?.addEventListener('click', restarters[gameType]);
  document.getElementById('back-lobby-btn')?.addEventListener('click', _renderLobby);
  document.getElementById('share-result-btn')?.addEventListener('click', () => {
    const title  = gameTitles[gameType];
    const stars  = pct >= 80 ? '⭐⭐⭐' : pct >= 50 ? '⭐⭐' : '⭐';
    const text   = `${emoji} I scored ${_score}/${max} (${pct}%) in ${title} on World Explorer! ${stars}\n\nThink you can beat me? 🌍`;
    _shareOrCopy(text);
  });
}

/* ── HTML helpers ────────────────────────────────────────────── */
function _hud() {
  return `
    <div class="game-hud">
      <div class="game-score">${_score} <span style="font-size:.9rem;color:var(--text-muted);">pts</span></div>
      <div class="game-round">Round ${_round} / ${ROUNDS}</div>
      <button class="btn btn-ghost" id="quit-btn"
              style="font-size:0.73rem;padding:var(--sp-1) var(--sp-3);">Quit</button>
    </div>`;
}

function _timerBar(total = FLAG_TIMER_S) {
  return `<div class="game-timer-bar">
    <div class="game-timer-fill" id="timer-fill" style="width:100%;"></div>
  </div>`;
}

function _statBox(label, value, colour) {
  return `<div>
    <div style="font-size:0.62rem;color:var(--text-muted);font-family:var(--font-display);
                font-weight:600;letter-spacing:0.07em;text-transform:uppercase;">${label}</div>
    <div style="font-family:var(--font-display);font-weight:800;font-size:1.5rem;
                color:${colour};">${value}</div>
  </div>`;
}

/* ── Data utils ──────────────────────────────────────────────── */
function _pickOptions(correct, n) {
  const others = _shuffled(AppState.countries.filter(c => c.cca2 !== correct.cca2)).slice(0, n-1);
  return _shuffled([correct, ...others]);
}

function _shuffled(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function _bbox(country) {
  const [lat, lng] = country.latlng;
  const spread = country.area > 1000000 ? 12 : country.area > 100000 ? 6 : country.area > 10000 ? 3 : 1.5;
  return `${lng-spread},${lat-spread},${lng+spread},${lat+spread}`;
}

function _loadScores() {
  try { return JSON.parse(localStorage.getItem(LS_SCORES)||'{}'); } catch { return {}; }
}

function _saveScores(s) {
  localStorage.setItem(LS_SCORES, JSON.stringify(s));
}

function _shareOrCopy(text) {
  if (navigator.share) {
    navigator.share({ title: 'World Explorer', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Result copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Could not share — try copying manually', 'error');
    });
  }
}

/** Public — called from settings page */
export function resetScores() {
  localStorage.removeItem(LS_SCORES);
}
