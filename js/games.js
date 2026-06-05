/* ============================================================
   World Explorer — Games Page  (js/games.js)
   Game 1: Flag Flash  — guess the country from its flag
   Game 2: Distance Duel — which country is closer to home?
   ============================================================ */

import { AppState, showToast, openHomePicker } from './app.js';
import { flagUrl, haversine }                  from './api.js';

/* ── Constants ───────────────────────────────────────────────── */
const ROUNDS        = 10;
const FLAG_TIMER_S  = 10;   /* seconds per Flag Flash round */
const LS_SCORES     = 'worldex:hiscores';

/* ── State ───────────────────────────────────────────────────── */
let _initialised  = false;
let _activeGame   = null;   /* 'flag' | 'duel' | null */
let _round        = 0;
let _score        = 0;
let _timerHandle  = null;
let _timerLeft    = FLAG_TIMER_S;
let _answered     = false;
let _pool         = [];     /* shuffled country pool for this session */

/* ── Entry point ─────────────────────────────────────────────── */
export function initGamesPage() {
  if (_initialised) {
    _renderLobby();
    return;
  }
  _initialised = true;
  _buildPage();
}

/* ── Build page shell ────────────────────────────────────────── */
function _buildPage() {
  const page = document.getElementById('page-games');
  if (!page) return;

  page.innerHTML = `
    <!-- Lobby -->
    <div id="games-lobby">
      <h2 class="t-heading mb-2" style="font-size:1.3rem;">Geography Games</h2>
      <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:var(--sp-5);">
        Test your world knowledge. All data comes from the app — no extra downloads.
      </p>

      <!-- High scores strip -->
      <div id="hiscore-strip" style="display:flex;gap:var(--sp-3);margin-bottom:var(--sp-5);
           overflow-x:auto;scrollbar-width:none;padding-bottom:2px;"></div>

      <!-- Game cards -->
      <div class="games-grid">

        <div class="game-card flag-game" id="start-flag-game">
          <div class="game-emoji">🚩</div>
          <div class="game-title">Flag Flash</div>
          <div class="game-desc">
            A flag appears — you have 10 seconds to name the country.
            Pick from 4 options before time runs out!
          </div>
          <div class="game-meta">
            <span>⏱ 10 sec/round</span>
            <span>🎯 ${ROUNDS} rounds</span>
            <span>🏆 High score</span>
          </div>
        </div>

        <div class="game-card dist-game" id="start-duel-game">
          <div class="game-emoji">📏</div>
          <div class="game-title">Distance Duel</div>
          <div class="game-desc">
            Two countries appear — which one is closer to your home country?
            Trust your gut and your geography!
          </div>
          <div class="game-meta">
            <span>🏠 Needs home country</span>
            <span>🎯 ${ROUNDS} rounds</span>
            <span>🏆 High score</span>
          </div>
        </div>

      </div>
    </div>

    <!-- Game arena -->
    <div id="game-arena"></div>
  `;

  _renderLobby();
  _bindLobbyEvents();
}

/* ── Render lobby (scores etc.) ──────────────────────────────── */
function _renderLobby() {
  /* Show arena = off, lobby = on */
  const lobby = document.getElementById('games-lobby');
  const arena = document.getElementById('game-arena');
  if (lobby) lobby.style.display = 'block';
  if (arena) { arena.innerHTML = ''; arena.classList.remove('active'); }
  _stopTimer();
  _activeGame = null;

  /* High scores */
  const scores = _loadScores();
  const strip  = document.getElementById('hiscore-strip');
  if (strip) {
    const items = [
      { label: 'Flag Flash Best',   val: scores.flag  ?? '—', icon: '🚩' },
      { label: 'Distance Duel Best',val: scores.duel  ?? '—', icon: '📏' },
      { label: 'Games Played',      val: scores.played ?? 0,  icon: '🎮' },
    ];
    strip.innerHTML = items.map(i => `
      <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);
                  border-radius:var(--r-lg);padding:var(--sp-3) var(--sp-4);
                  flex-shrink:0;text-align:center;min-width:100px;">
        <div style="font-size:1.2rem;margin-bottom:4px;">${i.icon}</div>
        <div style="font-family:var(--font-display);font-weight:800;
                    font-size:1.2rem;color:var(--teal-bright);">${i.val}</div>
        <div style="font-size:0.65rem;color:var(--text-muted);
                    font-family:var(--font-display);font-weight:600;
                    letter-spacing:0.06em;text-transform:uppercase;
                    margin-top:2px;">${i.label}</div>
      </div>`).join('');
  }
}

function _bindLobbyEvents() {
  document.getElementById('start-flag-game')
    ?.addEventListener('click', () => _startFlagGame());

  document.getElementById('start-duel-game')
    ?.addEventListener('click', () => {
      if (!AppState.homeCountry) {
        showToast('Please set your home country first!', 'info');
        openHomePicker();
        return;
      }
      _startDuelGame();
    });
}

/* ══════════════════════════════════════════════════════════════
   GAME 1 — FLAG FLASH
   ══════════════════════════════════════════════════════════════ */

function _startFlagGame() {
  _activeGame = 'flag';
  _round      = 0;
  _score      = 0;
  _pool       = _shuffled(AppState.countries.filter(c => c.cca2));
  _showArena();
  _nextFlagRound();
}

function _nextFlagRound() {
  if (_round >= ROUNDS) { _endGame('flag'); return; }

  _round++;
  _answered  = false;
  _timerLeft = FLAG_TIMER_S;

  const correct = _pool[_round - 1];
  const options = _pickOptions(correct, 4);
  const arena   = document.getElementById('game-arena');
  if (!arena) return;

  arena.innerHTML = `
    <!-- HUD -->
    <div class="game-hud">
      <div class="game-score">${_score} <span style="font-size:0.9rem;color:var(--text-muted);">pts</span></div>
      <div class="game-round">Round ${_round} / ${ROUNDS}</div>
      <button class="btn btn-ghost" id="quit-btn"
              style="font-size:0.75rem;padding:var(--sp-1) var(--sp-3);">Quit</button>
    </div>

    <!-- Timer bar -->
    <div class="game-timer-bar">
      <div class="game-timer-fill" id="timer-fill" style="width:100%;"></div>
    </div>

    <!-- Flag -->
    <img class="flag-display" id="flag-img"
         src="${flagUrl(correct)}"
         alt="Mystery flag"
         style="background:var(--bg-raised);">

    <div class="game-question">Which country does this flag belong to?</div>

    <!-- Options -->
    <div class="options-grid" id="options-grid">
      ${options.map((c, i) => `
        <button class="option-btn" data-cca2="${c.cca2}" data-correct="${c.cca2 === correct.cca2}">
          ${c.name}
        </button>`).join('')}
    </div>

    <!-- Feedback -->
    <div id="round-feedback" style="text-align:center;min-height:32px;
         font-family:var(--font-display);font-weight:700;font-size:0.95rem;"></div>
  `;

  _bindFlagOptions(correct);
  _startTimer(() => _onFlagTimeout(correct));
  document.getElementById('quit-btn')?.addEventListener('click', _renderLobby);
}

function _bindFlagOptions(correct) {
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_answered) return;
      _answered = true;
      _stopTimer();

      const isCorrect = btn.dataset.correct === 'true';
      if (isCorrect) {
        _score += Math.max(1, _timerLeft);   /* more points for speed */
        btn.classList.add('correct');
        _showFeedback(`✓ Correct! +${Math.max(1, _timerLeft)} pts`, 'var(--green-bright)');
      } else {
        btn.classList.add('wrong');
        /* Reveal correct answer */
        document.querySelectorAll('.option-btn').forEach(b => {
          if (b.dataset.correct === 'true') b.classList.add('correct');
        });
        _showFeedback(`✗ It was ${correct.name}`, 'var(--coral-bright)');
      }

      /* Disable all buttons */
      document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

      /* Next round after pause */
      setTimeout(_nextFlagRound, 1600);
    });
  });
}

function _onFlagTimeout(correct) {
  if (_answered) return;
  _answered = true;
  document.querySelectorAll('.option-btn').forEach(b => {
    b.disabled = true;
    if (b.dataset.correct === 'true') b.classList.add('correct');
  });
  _showFeedback(`⏱ Time's up! It was ${correct.name}`, 'var(--amber-bright)');
  setTimeout(_nextFlagRound, 1600);
}

/* ══════════════════════════════════════════════════════════════
   GAME 2 — DISTANCE DUEL
   ══════════════════════════════════════════════════════════════ */

function _startDuelGame() {
  _activeGame = 'duel';
  _round      = 0;
  _score      = 0;
  _pool       = _shuffled(
    AppState.countries.filter(c =>
      c.cca2 !== AppState.homeCountry?.cca2 && c.cca2
    )
  );
  _showArena();
  _nextDuelRound();
}

function _nextDuelRound() {
  if (_round >= ROUNDS) { _endGame('duel'); return; }

  _round++;
  _answered = false;

  const home     = AppState.homeCountry;
  const countryA = _pool[((_round - 1) * 2) % _pool.length];
  const countryB = _pool[((_round - 1) * 2 + 1) % _pool.length];

  const distA = haversine(home.latlng[0], home.latlng[1], countryA.latlng[0], countryA.latlng[1]);
  const distB = haversine(home.latlng[0], home.latlng[1], countryB.latlng[0], countryB.latlng[1]);
  const closer = distA < distB ? 'A' : 'B';

  const arena = document.getElementById('game-arena');
  if (!arena) return;

  arena.innerHTML = `
    <!-- HUD -->
    <div class="game-hud">
      <div class="game-score">${_score} <span style="font-size:0.9rem;color:var(--text-muted);">pts</span></div>
      <div class="game-round">Round ${_round} / ${ROUNDS}</div>
      <button class="btn btn-ghost" id="quit-btn"
              style="font-size:0.75rem;padding:var(--sp-1) var(--sp-3);">Quit</button>
    </div>

    <!-- Question -->
    <div class="game-question" style="margin-bottom:var(--sp-4);">
      Which country is <span style="color:var(--teal-bright);font-weight:800;">closer</span>
      to <span style="color:var(--amber-bright);">${home.name}</span>?
    </div>

    <!-- Home flag for reference -->
    <div style="text-align:center;margin-bottom:var(--sp-4);">
      <img src="${flagUrl(home,'w320')}" alt="${home.name}"
           style="height:36px;border-radius:4px;box-shadow:var(--shadow-sm);
                  border:2px solid var(--amber-dim);">
      <div style="font-size:0.7rem;color:var(--amber-bright);margin-top:4px;
                  font-family:var(--font-display);font-weight:600;">HOME</div>
    </div>

    <!-- Two options -->
    <div class="duel-flags" id="duel-options">
      ${_duelOptionHTML(countryA, 'A', distA)}
      ${_duelOptionHTML(countryB, 'B', distB)}
    </div>

    <!-- Feedback -->
    <div id="round-feedback" style="text-align:center;min-height:32px;
         font-family:var(--font-display);font-weight:700;font-size:0.95rem;"></div>
  `;

  _bindDuelOptions(countryA, countryB, distA, distB, closer);
  document.getElementById('quit-btn')?.addEventListener('click', _renderLobby);
}

function _duelOptionHTML(country, slot, dist) {
  return `
    <button class="duel-option" data-slot="${slot}" data-dist="${dist}">
      <img class="duel-flag-img"
           src="${flagUrl(country)}"
           alt="${country.name}"
           style="background:var(--bg-raised);">
      <div class="duel-country-name">${country.name}</div>
      <div class="duel-dist-reveal">${dist.toLocaleString()} km away</div>
    </button>`;
}

function _bindDuelOptions(cA, cB, distA, distB, closer) {
  document.querySelectorAll('.duel-option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_answered) return;
      _answered = true;

      const chosen    = btn.dataset.slot;
      const isCorrect = chosen === closer;

      if (isCorrect) {
        _score++;
        btn.classList.add('correct');
        _showFeedback('✓ Correct! +1 pt', 'var(--green-bright)');
      } else {
        btn.classList.add('wrong');
        /* Highlight correct */
        document.querySelectorAll('.duel-option').forEach(b => {
          if (b.dataset.slot === closer) b.classList.add('correct');
        });
        _showFeedback('✗ Wrong direction!', 'var(--coral-bright)');
      }

      /* Reveal distances */
      document.querySelectorAll('.duel-option').forEach(b => {
        b.classList.add('revealed');
        b.disabled = true;
      });

      setTimeout(_nextDuelRound, 2000);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   SHARED — TIMER, END SCREEN, UTILS
   ══════════════════════════════════════════════════════════════ */

function _startTimer(onExpire) {
  _stopTimer();
  _timerLeft = FLAG_TIMER_S;
  _updateTimerBar();

  _timerHandle = setInterval(() => {
    _timerLeft--;
    _updateTimerBar();
    if (_timerLeft <= 0) {
      _stopTimer();
      onExpire();
    }
  }, 1000);
}

function _stopTimer() {
  if (_timerHandle) { clearInterval(_timerHandle); _timerHandle = null; }
}

function _updateTimerBar() {
  const fill = document.getElementById('timer-fill');
  if (!fill) return;
  const pct = (_timerLeft / FLAG_TIMER_S) * 100;
  fill.style.width = pct + '%';
  /* Colour shift: green → amber → red */
  fill.style.background = pct > 50
    ? 'linear-gradient(90deg, var(--teal-bright), var(--teal-mid))'
    : pct > 25
      ? 'linear-gradient(90deg, var(--amber-bright), var(--amber-mid))'
      : 'linear-gradient(90deg, var(--coral-bright), var(--coral-mid))';
}

function _showFeedback(msg, colour) {
  const el = document.getElementById('round-feedback');
  if (!el) return;
  el.textContent   = msg;
  el.style.color   = colour;
  el.style.opacity = '1';
}

function _showArena() {
  const lobby = document.getElementById('games-lobby');
  const arena = document.getElementById('game-arena');
  if (lobby) lobby.style.display = 'none';
  if (arena) { arena.classList.add('active'); arena.innerHTML = ''; }
}

function _endGame(gameType) {
  _stopTimer();

  const max      = gameType === 'flag' ? ROUNDS * FLAG_TIMER_S : ROUNDS;
  const pct      = Math.round((_score / max) * 100);
  const emoji    = pct >= 80 ? '🏆' : pct >= 50 ? '🌍' : pct >= 30 ? '🗺️' : '📚';
  const msg      = pct >= 80 ? 'Geography master!' :
                   pct >= 50 ? 'Solid world knowledge!' :
                   pct >= 30 ? 'Keep exploring!' : 'The world awaits you!';

  /* Save high score */
  const scores = _loadScores();
  const key    = gameType === 'flag' ? 'flag' : 'duel';
  if (scores[key] == null || _score > scores[key]) scores[key] = _score;
  scores.played = (scores.played || 0) + 1;
  _saveScores(scores);

  const arena = document.getElementById('game-arena');
  if (!arena) return;

  arena.innerHTML = `
    <div class="game-over">
      <div class="game-over-emoji">${emoji}</div>
      <div class="game-over-score">${_score}</div>
      <div class="game-over-label">
        out of ${max} points · ${gameType === 'flag' ? 'Flag Flash' : 'Distance Duel'}
      </div>
      <div class="game-over-msg">${msg}</div>

      <!-- Score breakdown -->
      <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);
                  border-radius:var(--r-xl);padding:var(--sp-5);margin-bottom:var(--sp-6);
                  display:inline-block;min-width:240px;">
        <div style="display:flex;justify-content:space-between;gap:var(--sp-6);margin-bottom:var(--sp-3);">
          <div>
            <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-display);
                        font-weight:600;letter-spacing:0.07em;text-transform:uppercase;">Score</div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:1.5rem;
                        color:var(--teal-bright);">${_score}</div>
          </div>
          <div>
            <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-display);
                        font-weight:600;letter-spacing:0.07em;text-transform:uppercase;">Rounds</div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:1.5rem;
                        color:var(--text-primary);">${ROUNDS}</div>
          </div>
          <div>
            <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-display);
                        font-weight:600;letter-spacing:0.07em;text-transform:uppercase;">Best</div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:1.5rem;
                        color:var(--amber-bright);">${scores[key]}</div>
          </div>
        </div>
        <!-- Progress bar -->
        <div style="background:var(--bg-overlay);border-radius:var(--r-full);height:6px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;border-radius:var(--r-full);
                      background:linear-gradient(90deg,var(--teal-bright),var(--amber-bright));
                      transition:width 800ms cubic-bezier(0.16,1,0.3,1);"></div>
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:var(--sp-2);
                    font-family:var(--font-display);font-weight:600;">
          ${pct}% accuracy
        </div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;flex-direction:column;gap:var(--sp-3);max-width:280px;margin:0 auto;">
        <button class="btn btn-primary btn-full" id="play-again-btn">
          Play Again
        </button>
        <button class="btn btn-secondary btn-full" id="back-lobby-btn">
          ← Back to Games
        </button>
      </div>
    </div>`;

  document.getElementById('play-again-btn')?.addEventListener('click', () => {
    if (gameType === 'flag') _startFlagGame();
    else _startDuelGame();
  });

  document.getElementById('back-lobby-btn')?.addEventListener('click', _renderLobby);
}

/* ── Utils ───────────────────────────────────────────────────── */

/** Pick `n` options including the correct one, shuffled */
function _pickOptions(correct, n) {
  const others = _shuffled(
    AppState.countries.filter(c => c.cca2 !== correct.cca2)
  ).slice(0, n - 1);
  return _shuffled([correct, ...others]);
}

function _shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _loadScores() {
  try { return JSON.parse(localStorage.getItem(LS_SCORES) || '{}'); }
  catch { return {}; }
}

function _saveScores(scores) {
  localStorage.setItem(LS_SCORES, JSON.stringify(scores));
}
