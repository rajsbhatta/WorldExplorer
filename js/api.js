/* ============================================================
   World Explorer — API Layer  (js/api.js)
   Primary:  restcountries.com/v3.1
   Fallback: restcountries.com/v3.1 (retry without fields filter)
   Fallback2: countrylayer.com alternative field set
   Cache: IndexedDB with graceful fallback to in-memory Map
   ============================================================ */

/* ── In-memory fallback cache (used if IndexedDB unavailable) ── */
const _memCache = new Map();

/* ── IndexedDB cache ─────────────────────────────────────────── */
const DB_NAME    = 'worldex-cache';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
let _db          = null;
let _dbFailed    = false;

function openDB() {
  if (_dbFailed)                return Promise.reject('idb-disabled');
  if (_db)                      return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(STORE_NAME, { keyPath: 'k' });
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = ()  => { _dbFailed = true; reject('idb-error'); };
    } catch(e) {
      _dbFailed = true;
      reject('idb-unavailable');
    }
  });
}

async function cacheGet(key) {
  /* Try IndexedDB */
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const rec = req.result;
        if (!rec) return resolve(null);
        if (rec.expires && Date.now() > rec.expires) {
          cacheDelete(key).catch(()=>{});
          return resolve(null);
        }
        resolve(rec.v);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* Fallback to memory */
    const rec = _memCache.get(key);
    if (!rec) return null;
    if (rec.expires && Date.now() > rec.expires) { _memCache.delete(key); return null; }
    return rec.v;
  }
}

async function cacheSet(key, value, ttlMs = 24 * 60 * 60 * 1000) {
  /* Always write to memory first (instant, never fails) */
  _memCache.set(key, { v: value, expires: Date.now() + ttlMs });
  /* Best-effort write to IndexedDB */
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ k: key, v: value, expires: Date.now() + ttlMs });
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch { /* silent — memory cache is the backup */ }
}

async function cacheDelete(key) {
  _memCache.delete(key);
  try {
    const db = await openDB();
    await new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
    });
  } catch { /* silent */ }
}

export async function clearAllCache() {
  _memCache.clear();
  try {
    const db = await openDB();
    await new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
    });
  } catch { /* silent */ }
}

/* ── Safe fetch with timeout ─────────────────────────────────── */
async function safeFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch(e) {
    clearTimeout(timer);
    throw e;
  }
}

/* ── Number formatters ───────────────────────────────────────── */
export function fmtNumber(n) {
  if (n == null) return '—';
  n = Number(n);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function fmtArea(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString() + ' km²';
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ── REST Countries ──────────────────────────────────────────── */
const RC_BASE   = 'https://restcountries.com/v3.1';
const RC_FIELDS = [
  'name','cca2','cca3','capital','region','subregion',
  'population','area','landlocked','latlng','borders',
  'languages','currencies','timezones','idd','tld',
  'flags','coatOfArms','car','continents','independent',
  'unMember','startOfWeek','fifa'
].join(',');

export async function loadAllCountries() {
  const CACHE_KEY = 'rc:all:v2';
  const TTL       = 7 * 24 * 60 * 60 * 1000;

  /* 1 — try cache */
  const cached = await cacheGet(CACHE_KEY);
  if (cached && Array.isArray(cached) && cached.length > 100) {
    return cached;
  }

  /* 2 — try primary URL (with fields filter) */
  let rawData = null;
  const urls = [
    `${RC_BASE}/all?fields=${RC_FIELDS}`,
    `${RC_BASE}/all`,                         /* fallback: no fields filter */
  ];

  for (const url of urls) {
    try {
      console.log('[API] Fetching:', url);
      const res = await safeFetch(url);
      if (!res.ok) {
        console.warn('[API] HTTP', res.status, 'from', url);
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json) && json.length > 50) {
        rawData = json;
        console.log('[API] Got', json.length, 'countries from', url);
        break;
      }
    } catch(e) {
      console.warn('[API] Fetch failed for', url, e.message);
    }
  }

  if (!rawData) {
    throw new Error('Could not load country data from any source');
  }

  /* Normalise + sort */
  const result = rawData
    .filter(c => c.name?.common)   /* must have a name */
    .map(normaliseCountry)
    .sort((a, b) => a.name.localeCompare(b.name));

  /* Cache result */
  await cacheSet(CACHE_KEY, result, TTL);
  return result;
}

export async function getCountry(cca2) {
  const all = await loadAllCountries();
  return all.find(c => c.cca2 === cca2.toUpperCase()) || null;
}

export async function getCountriesByCca3(cca3Arr) {
  const all = await loadAllCountries();
  return cca3Arr.map(c3 => all.find(c => c.cca3 === c3)).filter(Boolean);
}

function normaliseCountry(raw) {
  const currencies = raw.currencies
    ? Object.entries(raw.currencies).map(([code, val]) => ({
        code,
        name:   val?.name   || code,
        symbol: val?.symbol || ''
      }))
    : [];

  const languages = raw.languages
    ? Object.values(raw.languages)
    : [];

  const callingCode = raw.idd?.root
    ? raw.idd.root + (raw.idd.suffixes?.[0] || '')
    : '—';

  return {
    name:         raw.name?.common        || '—',
    officialName: raw.name?.official      || raw.name?.common || '—',
    nativeName:   _nativeName(raw.name),
    cca2:         raw.cca2                || '',
    cca3:         raw.cca3                || '',
    capital:      raw.capital?.[0]        || '—',
    region:       raw.region              || '—',
    subregion:    raw.subregion           || '—',
    continents:   raw.continents          || [],
    population:   raw.population          || 0,
    area:         raw.area                || 0,
    landlocked:   raw.landlocked          || false,
    latlng:       raw.latlng              || [0, 0],
    borders:      raw.borders             || [],
    languages,
    currencies,
    timezones:    raw.timezones           || [],
    callingCode,
    tld:          raw.tld?.[0]            || '—',
    flagPng:      raw.flags?.png          || '',
    flagSvg:      raw.flags?.svg          || '',
    flagAlt:      raw.flags?.alt          || '',
    coatOfArms:   raw.coatOfArms?.png     || '',
    drivingSide:  raw.car?.side           || '—',
    unMember:     raw.unMember            || false,
    independent:  raw.independent         !== false,
    fifa:         raw.fifa                || '',
    startOfWeek:  raw.startOfWeek         || 'monday',
  };
}

function _nativeName(nameObj) {
  if (!nameObj?.nativeName) return null;
  const first = Object.values(nameObj.nativeName)[0];
  return first?.common || null;
}

/* ── World Bank ──────────────────────────────────────────────── */
const WB_BASE       = 'https://api.worldbank.org/v2';
const WB_INDICATORS = [
  'NY.GDP.MKTP.CD',
  'NY.GDP.PCAP.CD',
  'EN.POP.DNST',
  'SP.DYN.LE00.IN',
  'SE.ADT.LITR.ZS',
  'SL.UEM.TOTL.ZS',
  'FP.CPI.TOTL.ZG'
];

export async function loadWorldBankData(cca2) {
  const cacheKey = `wb:${cca2}:v2`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  const results = {};
  await Promise.allSettled(
    WB_INDICATORS.map(async indicator => {
      try {
        const url = `${WB_BASE}/country/${cca2}/indicator/${indicator}?format=json&mrv=1&per_page=1`;
        const res = await safeFetch(url, {}, 10000);
        if (!res.ok) return;
        const json = await res.json();
        const val  = json?.[1]?.[0]?.value;
        if (val != null) results[indicator] = val;
      } catch { /* skip silently */ }
    })
  );

  const formatted = {
    gdp:          results['NY.GDP.MKTP.CD'] ?? null,
    gdpPerCapita: results['NY.GDP.PCAP.CD'] ?? null,
    density:      results['EN.POP.DNST']    ?? null,
    lifeExp:      results['SP.DYN.LE00.IN'] ?? null,
    literacy:     results['SE.ADT.LITR.ZS'] ?? null,
    unemployment: results['SL.UEM.TOTL.ZS'] ?? null,
    inflation:    results['FP.CPI.TOTL.ZG'] ?? null,
  };

  await cacheSet(cacheKey, formatted, 3 * 24 * 60 * 60 * 1000);
  return formatted;
}

export function fmtWB(key, val) {
  if (val == null) return '—';
  switch (key) {
    case 'gdp':          return '$' + fmtNumber(val);
    case 'gdpPerCapita': return '$' + fmtNumber(val);
    case 'density':      return Number(val).toFixed(1) + '/km²';
    case 'lifeExp':      return Number(val).toFixed(1) + ' yrs';
    case 'literacy':     return Number(val).toFixed(1) + '%';
    case 'unemployment': return Number(val).toFixed(1) + '%';
    case 'inflation':    return Number(val).toFixed(1) + '%';
    default:             return String(val);
  }
}

/* ── Wikidata ────────────────────────────────────────────────── */
const WD_ENDPOINT = 'https://query.wikidata.org/sparql';

export async function loadWikidataPolitical(countryName) {
  const cacheKey = `wd:pol:${countryName}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  const sparql = `
    SELECT ?govTypeLabel ?hosLabel ?hogLabel WHERE {
      ?country wikibase:sitelinks ?sl .
      ?country rdfs:label "${countryName}"@en .
      OPTIONAL { ?country wdt:P122 ?govType . }
      OPTIONAL { ?country wdt:P35  ?hos . }
      OPTIONAL { ?country wdt:P6   ?hog . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 1`;

  try {
    const url = `${WD_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await safeFetch(url, { headers:{ Accept:'application/sparql-results+json' } }, 12000);
    if (!res.ok) throw new Error('Wikidata ' + res.status);
    const json = await res.json();
    const row  = json.results?.bindings?.[0] || {};
    const result = {
      governmentType: row.govTypeLabel?.value || null,
      headOfState:    row.hosLabel?.value     || null,
      headOfGov:      row.hogLabel?.value     || null,
    };
    await cacheSet(cacheKey, result, 7 * 24 * 60 * 60 * 1000);
    return result;
  } catch {
    return { governmentType: null, headOfState: null, headOfGov: null };
  }
}

export async function loadSharedOrgs(country1Name, country2Name) {
  const cacheKey = `wd:orgs:${country1Name}:${country2Name}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  const sparql = `
    SELECT ?orgLabel WHERE {
      ?c1 rdfs:label "${country1Name}"@en .
      ?c2 rdfs:label "${country2Name}"@en .
      ?c1 wdt:P463 ?org . ?c2 wdt:P463 ?org .
      ?org wdt:P31 wd:Q484652 .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 20`;

  try {
    const url = `${WD_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await safeFetch(url, { headers:{ Accept:'application/sparql-results+json' } }, 12000);
    if (!res.ok) throw new Error('Wikidata ' + res.status);
    const json = await res.json();
    const orgs = (json.results?.bindings || [])
      .map(b => b.orgLabel?.value)
      .filter(v => v && !v.startsWith('Q'));
    await cacheSet(cacheKey, orgs, 7 * 24 * 60 * 60 * 1000);
    return orgs;
  } catch {
    return [];
  }
}

/* ── Flag URL ────────────────────────────────────────────────── */
export function flagUrl(country, size = 'w320') {
  if (country?.flagPng) return country.flagPng;
  if (country?.cca2)    return `https://flagcdn.com/${size}/${country.cca2.toLowerCase()}.png`;
  return '';
}

/* ── Stats for compare view ──────────────────────────────────── */
export function countryStats(country, wb) {
  return {
    population:   { label:'Population',     value:fmtNumber(country.population),          raw:country.population    },
    area:         { label:'Area',            value:fmtArea(country.area),                  raw:country.area          },
    gdp:          { label:'GDP',             value:fmtWB('gdp',wb?.gdp),                   raw:wb?.gdp               },
    gdpPerCap:    { label:'GDP/Capita',      value:fmtWB('gdpPerCapita',wb?.gdpPerCapita), raw:wb?.gdpPerCapita      },
    lifeExp:      { label:'Life Expectancy', value:fmtWB('lifeExp',wb?.lifeExp),           raw:wb?.lifeExp           },
    literacy:     { label:'Literacy',        value:fmtWB('literacy',wb?.literacy),         raw:wb?.literacy          },
    unemployment: { label:'Unemployment',    value:fmtWB('unemployment',wb?.unemployment), raw:wb?.unemployment      },
  };
}

export const REGIONS = ['All','Africa','Americas','Asia','Europe','Oceania'];
