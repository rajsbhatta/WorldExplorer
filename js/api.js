/* ============================================================
   World Explorer — API Layer  (js/api.js)

   Data sources (all free, no API key, GitHub raw = reliable):
     1. mledoze/countries  — name, cca2/3, borders, languages,
                             currencies, latlng, area, region,
                             subregion, idd, tld, landlocked
     2. dr5hn dataset      — population, gdp, timezones
     3. flagcdn.com        — flag images via iso2 code
     4. World Bank API     — richer economic indicators
     5. Wikidata SPARQL    — govt type, head of state

   restcountries.com intentionally removed — returns 403.
   ============================================================ */

/* ── In-memory fallback cache ────────────────────────────────── */
const _mem = new Map();

/* ── IndexedDB cache with memory fallback ────────────────────── */
const DB_NAME = 'worldex-v3', DB_VER = 1, STORE = 'kv';
let _db = null, _dbDead = false;

function openDB() {
  if (_dbDead) return Promise.reject('idb-dead');
  if (_db)     return Promise.resolve(_db);
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath:'k' });
      r.onsuccess = e => { _db = e.target.result; res(_db); };
      r.onerror   = ()  => { _dbDead = true; rej('idb-err'); };
    } catch { _dbDead = true; rej('idb-na'); }
  });
}

async function cGet(key) {
  try {
    const db = await openDB();
    return await new Promise((res, rej) => {
      const r = db.transaction(STORE,'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => {
        const rec = r.result;
        if (!rec) return res(null);
        if (rec.exp && Date.now() > rec.exp) { cDel(key); return res(null); }
        res(rec.v);
      };
      r.onerror = () => rej(r.error);
    });
  } catch {
    const m = _mem.get(key);
    if (!m) return null;
    if (m.exp && Date.now() > m.exp) { _mem.delete(key); return null; }
    return m.v;
  }
}

async function cSet(key, value, ttl = 86400000) {
  const exp = Date.now() + ttl;
  _mem.set(key, { v: value, exp });
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({ k:key, v:value, exp });
      tx.oncomplete = res; tx.onerror = rej;
    });
  } catch { /* memory cache is the backup */ }
}

function cDel(key) {
  _mem.delete(key);
  openDB().then(db => {
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(key);
  }).catch(()=>{});
}

export async function clearAllCache() {
  _mem.clear();
  try {
    const db = await openDB();
    await new Promise(res => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = res;
    });
  } catch {}
}

/* ── Safe fetch with timeout ─────────────────────────────────── */
function safeFetch(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(tid));
}

/* ── Formatters ──────────────────────────────────────────────── */
export function fmtNumber(n) {
  if (n == null) return '—';
  n = Number(n);
  if (n >= 1e9) return (n/1e9).toFixed(2)+'B';
  if (n >= 1e6) return (n/1e6).toFixed(2)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
  return n.toLocaleString();
}
export function fmtArea(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString()+' km²';
}
export function haversine(lat1,lon1,lat2,lon2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}

/* ── Flag URL ────────────────────────────────────────────────── */
export function flagUrl(country, _size = 'w320') {
  if (!country?.cca2) return '';
  const code = country.cca2.toLowerCase();
  return `https://flagcdn.com/w320/${code}.png`;
}

/* ══════════════════════════════════════════════════════════════
   PRIMARY DATA — mledoze + dr5hn merged
   ══════════════════════════════════════════════════════════════ */
const MLEDOZE_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const DR5HN_URL   = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json';
const CACHE_KEY   = 'merged:v4';
const CACHE_TTL   = 7 * 86400000; // 7 days

export async function loadAllCountries() {
  /* 1 — cache hit */
  const hit = await cGet(CACHE_KEY);
  if (hit && Array.isArray(hit) && hit.length > 100) return hit;

  /* 2 — fetch both sources in parallel */
  const [mledozeRes, dr5hnRes] = await Promise.allSettled([
    safeFetch(MLEDOZE_URL).then(r => { if(!r.ok) throw r.status; return r.json(); }),
    safeFetch(DR5HN_URL  ).then(r => { if(!r.ok) throw r.status; return r.json(); }),
  ]);

  if (mledozeRes.status === 'rejected') {
    throw new Error('Failed to load country data: ' + mledozeRes.reason);
  }

  const mledoze = mledozeRes.value;  /* primary — always available */

  /* Build a population/timezone lookup from dr5hn (keyed by iso2) */
  const dr5hnMap = new Map();
  if (dr5hnRes.status === 'fulfilled') {
    for (const c of dr5hnRes.value) {
      if (c.iso2) dr5hnMap.set(c.iso2.toUpperCase(), c);
    }
  }

  const result = mledoze
    .filter(c => c.cca2 && c.name?.common)
    .map(raw => _merge(raw, dr5hnMap.get(raw.cca2)))
    .sort((a,b) => a.name.localeCompare(b.name));

  await cSet(CACHE_KEY, result, CACHE_TTL);
  return result;
}

function _merge(m, d) {
  /* m = mledoze record, d = dr5hn record (may be undefined) */
  const currencies = m.currencies
    ? Object.entries(m.currencies).map(([code,val]) => ({
        code, name: val?.name || code, symbol: val?.symbol || ''
      }))
    : [];

  const languages = m.languages ? Object.values(m.languages) : [];

  const callingCode = m.idd?.root
    ? m.idd.root + (m.idd.suffixes?.[0] || '')
    : (d?.phonecode ? '+'+d.phonecode : '—');

  const timezones = d?.timezones
    ? d.timezones.map(t => t.zoneName || t.tzName || String(t)).filter(Boolean)
    : [];

  return {
    name:         m.name?.common        || '—',
    officialName: m.name?.official      || m.name?.common || '—',
    nativeName:   _nativeName(m.name),
    cca2:         m.cca2                || '',
    cca3:         m.cca3                || '',
    capital:      m.capital?.[0]        || d?.capital || '—',
    region:       m.region              || '—',
    subregion:    m.subregion           || '—',
    continents:   m.continents          || [m.region].filter(Boolean),
    population:   d?.population         || 0,
    area:         m.area                || d?.area_sq_km || 0,
    landlocked:   m.landlocked          || false,
    latlng:       m.latlng              || (d ? [Number(d.latitude), Number(d.longitude)] : [0,0]),
    borders:      m.borders             || [],
    languages,
    currencies,
    timezones,
    callingCode,
    tld:          m.tld?.[0]            || d?.tld || '—',
    flagPng:      '',   /* built dynamically via flagUrl() */
    flagSvg:      '',
    flagAlt:      '',
    coatOfArms:   '',
    drivingSide:  m.car?.side           || '—',
    unMember:     m.unMember            || false,
    independent:  m.independent         !== false,
    fifa:         m.cioc                || '',
    startOfWeek:  'monday',
    gdpRaw:       d?.gdp                || null,  /* dr5hn GDP in millions USD */
  };
}

function _nativeName(nameObj) {
  if (!nameObj?.native) return null;
  const first = Object.values(nameObj.native)[0];
  return first?.common || null;
}

export async function getCountry(cca2) {
  const all = await loadAllCountries();
  return all.find(c => c.cca2 === cca2.toUpperCase()) || null;
}

export async function getCountriesByCca3(cca3Arr) {
  const all = await loadAllCountries();
  return cca3Arr.map(c3 => all.find(c => c.cca3 === c3)).filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════
   WORLD BANK — economic indicators
   ══════════════════════════════════════════════════════════════ */
const WB_BASE = 'https://api.worldbank.org/v2';
const WB_INDICATORS = [
  'NY.GDP.MKTP.CD','NY.GDP.PCAP.CD','EN.POP.DNST',
  'SP.DYN.LE00.IN','SE.ADT.LITR.ZS','SL.UEM.TOTL.ZS','FP.CPI.TOTL.ZG'
];

export async function loadWorldBankData(cca2) {
  const key    = `wb3:${cca2}`;
  const cached = await cGet(key);
  if (cached) return cached;

  const results = {};
  await Promise.allSettled(WB_INDICATORS.map(async ind => {
    try {
      const url = `${WB_BASE}/country/${cca2}/indicator/${ind}?format=json&mrv=1&per_page=1`;
      const res = await safeFetch(url, {}, 10000);
      if (!res.ok) return;
      const json = await res.json();
      const val  = json?.[1]?.[0]?.value;
      if (val != null) results[ind] = val;
    } catch {}
  }));

  const out = {
    gdp:          results['NY.GDP.MKTP.CD'] ?? null,
    gdpPerCapita: results['NY.GDP.PCAP.CD'] ?? null,
    density:      results['EN.POP.DNST']    ?? null,
    lifeExp:      results['SP.DYN.LE00.IN'] ?? null,
    literacy:     results['SE.ADT.LITR.ZS'] ?? null,
    unemployment: results['SL.UEM.TOTL.ZS'] ?? null,
    inflation:    results['FP.CPI.TOTL.ZG'] ?? null,
  };
  await cSet(key, out, 3*86400000);
  return out;
}

export function fmtWB(key, val) {
  if (val == null) return '—';
  switch(key) {
    case 'gdp':          return '$'+fmtNumber(val);
    case 'gdpPerCapita': return '$'+fmtNumber(val);
    case 'density':      return Number(val).toFixed(1)+'/km²';
    case 'lifeExp':      return Number(val).toFixed(1)+' yrs';
    case 'literacy':     return Number(val).toFixed(1)+'%';
    case 'unemployment': return Number(val).toFixed(1)+'%';
    case 'inflation':    return Number(val).toFixed(1)+'%';
    default:             return String(val);
  }
}

/* ══════════════════════════════════════════════════════════════
   WIKIDATA
   ══════════════════════════════════════════════════════════════ */
const WD = 'https://query.wikidata.org/sparql';

export async function loadWikidataPolitical(countryName) {
  const key    = `wd4:pol:${countryName}`;
  const cached = await cGet(key);
  if (cached) return cached;
  const sparql = `SELECT ?govTypeLabel ?hosLabel ?hogLabel WHERE {
    ?c rdfs:label "${countryName}"@en .
    OPTIONAL { ?c wdt:P122 ?govType . }
    OPTIONAL { ?c wdt:P35  ?hos . }
    OPTIONAL { ?c wdt:P6   ?hog . }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 1`;
  try {
    const res = await safeFetch(`${WD}?query=${encodeURIComponent(sparql)}&format=json`,
      { headers:{ Accept:'application/sparql-results+json' } }, 12000);
    if (!res.ok) throw 0;
    const json = await res.json();
    const row  = json.results?.bindings?.[0] || {};
    const out  = {
      governmentType: row.govTypeLabel?.value || null,
      headOfState:    row.hosLabel?.value     || null,
      headOfGov:      row.hogLabel?.value     || null,
    };
    await cSet(key, out, 7*86400000);
    return out;
  } catch { return { governmentType:null, headOfState:null, headOfGov:null }; }
}

export async function loadSharedOrgs(name1, name2) {
  const key    = `wd4:orgs:${name1}:${name2}`;
  const cached = await cGet(key);
  if (cached) return cached;
  const sparql = `SELECT ?orgLabel WHERE {
    ?c1 rdfs:label "${name1}"@en . ?c2 rdfs:label "${name2}"@en .
    ?c1 wdt:P463 ?org . ?c2 wdt:P463 ?org .
    ?org wdt:P31 wd:Q484652 .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 20`;
  try {
    const res = await safeFetch(`${WD}?query=${encodeURIComponent(sparql)}&format=json`,
      { headers:{ Accept:'application/sparql-results+json' } }, 12000);
    if (!res.ok) throw 0;
    const json = await res.json();
    const orgs = (json.results?.bindings||[])
      .map(b=>b.orgLabel?.value).filter(v=>v&&!v.startsWith('Q'));
    await cSet(key, orgs, 7*86400000);
    return orgs;
  } catch { return []; }
}

/* ── Stats for compare ───────────────────────────────────────── */
export function countryStats(country, wb) {
  return {
    population:   { label:'Population',     value:fmtNumber(country.population),          raw:country.population },
    area:         { label:'Area',            value:fmtArea(country.area),                  raw:country.area       },
    gdp:          { label:'GDP',             value:fmtWB('gdp',wb?.gdp),                   raw:wb?.gdp            },
    gdpPerCap:    { label:'GDP/Capita',      value:fmtWB('gdpPerCapita',wb?.gdpPerCapita), raw:wb?.gdpPerCapita   },
    lifeExp:      { label:'Life Expectancy', value:fmtWB('lifeExp',wb?.lifeExp),           raw:wb?.lifeExp        },
    literacy:     { label:'Literacy',        value:fmtWB('literacy',wb?.literacy),         raw:wb?.literacy       },
    unemployment: { label:'Unemployment',    value:fmtWB('unemployment',wb?.unemployment), raw:wb?.unemployment   },
  };
}

export const REGIONS = ['All','Africa','Americas','Asia','Europe','Oceania'];

/* ══════════════════════════════════════════════════════════════
   WIKIPEDIA SUMMARY
   Uses the Wikipedia REST summary API — free, no key, CORS OK.
   Returns 2-4 sentence encyclopedic description.
   ══════════════════════════════════════════════════════════════ */
export async function loadWikiSummary(countryName) {
  const cacheKey = `wiki:${countryName}`;
  const cached   = await cGet(cacheKey);
  if (cached) return cached;

  /* Wikipedia titles sometimes differ from country common names.
     Try the direct name first, then a few common fallbacks. */
  const candidates = [
    countryName,
    countryName + ' (country)',
    countryName.replace(/ /g, '_'),
  ];

  for (const title of candidates) {
    try {
      const encoded = encodeURIComponent(title.replace(/ /g, '_'));
      const url     = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
      const res     = await safeFetch(url, {
        headers: { Accept: 'application/json' }
      }, 10000);

      if (!res.ok) continue;
      const json = await res.json();

      /* Skip disambiguation pages */
      if (json.type === 'disambiguation') continue;

      const extract = json.extract?.trim();
      if (!extract || extract.length < 40) continue;

      /* Clean up — remove citation markers like [1], [note 1] */
      const clean = extract.replace(/\[\d+\]|\[note \d+\]/g, '').trim();

      const result = {
        extract:   clean,
        thumbnail: json.thumbnail?.source || null,
        url:       json.content_urls?.desktop?.page || null,
      };

      await cSet(cacheKey, result, 14 * 86400000); /* cache 14 days */
      return result;
    } catch { /* try next candidate */ }
  }

  return null;
}

/* ══════════════════════════════════════════════════════════════
   PASSPORT STAMPS  (localStorage only — never cleared by cache)
   Schema: { [cca2]: { type: 'visited'|'wishlist', year: number } }
   Backward-compat: old string values are normalised on read.
   ══════════════════════════════════════════════════════════════ */
const LS_STAMPS = 'worldex:stamps';

function _loadStamps() {
  try { return JSON.parse(localStorage.getItem(LS_STAMPS) || '{}'); }
  catch { return {}; }
}

function _saveStamps(stamps) {
  localStorage.setItem(LS_STAMPS, JSON.stringify(stamps));
}

/** Returns { type, year } or null */
export function getStamp(cca2) {
  const raw = _loadStamps()[cca2];
  if (!raw) return null;
  /* normalise old string format */
  if (typeof raw === 'string') return { type: raw, year: new Date().getFullYear() };
  return raw;
}

/** type: 'visited' | 'wishlist' | null  year: number (only for visited) */
export function setStamp(cca2, type, year) {
  const stamps = _loadStamps();
  if (type) stamps[cca2] = { type, year: year || new Date().getFullYear() };
  else delete stamps[cca2];
  _saveStamps(stamps);
}

export function getAllStamps() {
  return _loadStamps();
}
