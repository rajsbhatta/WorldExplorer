/* ============================================================
   World Explorer — API Layer  (js/api.js)
   Sources:
     1. REST Countries v3  — core country data (no key)
     2. World Bank API     — GDP, economic indicators (no key)
     3. Wikidata SPARQL    — government type, head of state (no key)
   All data is cached in IndexedDB via a simple KV store.
   ============================================================ */

/* ── IndexedDB cache ─────────────────────────────────────────── */
const DB_NAME    = 'worldex-cache';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'k' });
    };
    req.onsuccess  = e => { _db = e.target.result; resolve(_db); };
    req.onerror    = ()  => reject(req.error);
  });
}

async function cacheGet(key) {
  const db    = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      const rec = req.result;
      if (!rec) return resolve(null);
      /* TTL check */
      if (rec.expires && Date.now() > rec.expires) {
        cacheDelete(key);
        return resolve(null);
      }
      resolve(rec.v);
    };
    req.onerror = () => reject(req.error);
  });
}

async function cacheSet(key, value, ttlMs = 24 * 60 * 60 * 1000) {
  const db  = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ k: key, v: value, expires: Date.now() + ttlMs });
    tx.oncomplete = () => resolve();
    tx.onerror    = ()  => reject(tx.error);
  });
}

async function cacheDelete(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
  });
}

export async function clearAllCache() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
  });
}

/* ── Helpers ─────────────────────────────────────────────────── */
async function fetchJSON(url, cacheKey, ttlMs) {
  /* Try cache first */
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const data = await res.json();
  await cacheSet(cacheKey, data, ttlMs);
  return data;
}

/** Format large numbers with K / M / B suffix */
export function fmtNumber(n) {
  if (n == null) return '—';
  n = Number(n);
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return n.toLocaleString();
}

/** Format area in km² */
export function fmtArea(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString() + ' km²';
}

/** Haversine distance (km) between two lat/lng pairs */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ── 1. REST Countries ───────────────────────────────────────── */
const RC_BASE = 'https://restcountries.com/v3.1';
const RC_FIELDS = [
  'name','cca2','cca3','ccn3',
  'capital','region','subregion',
  'population','area','landlocked',
  'latlng','borders','languages','currencies',
  'timezones','callingCodes','idd',
  'tld','flags','coatOfArms',
  'car','continents','independent',
  'unMember','startOfWeek','fifa'
].join(',');

/** Load ALL countries — the heavy call, cached for 7 days */
export async function loadAllCountries() {
  const url = `${RC_BASE}/all?fields=${RC_FIELDS}`;
  const data = await fetchJSON(url, 'rc:all', 7 * 24 * 60 * 60 * 1000);

  /* Normalise into a consistent shape */
  return data
    .filter(c => c.independent !== false || c.unMember)
    .map(normaliseCountry)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Get single country by cca2 code */
export async function getCountry(cca2) {
  const all = await loadAllCountries();
  return all.find(c => c.cca2 === cca2.toUpperCase()) || null;
}

/** Get multiple countries by array of cca3 border codes */
export async function getCountriesByCca3(cca3Arr) {
  const all = await loadAllCountries();
  return cca3Arr.map(c3 => all.find(c => c.cca3 === c3)).filter(Boolean);
}

function normaliseCountry(raw) {
  const currencies = raw.currencies
    ? Object.entries(raw.currencies).map(([code, val]) => ({
        code,
        name: val.name,
        symbol: val.symbol || ''
      }))
    : [];

  const languages = raw.languages
    ? Object.values(raw.languages)
    : [];

  const callingCode = raw.idd?.root
    ? raw.idd.root + (raw.idd.suffixes?.[0] || '')
    : '—';

  return {
    name:        raw.name?.common        || '—',
    officialName:raw.name?.official      || '—',
    nativeName:  _nativeName(raw.name),
    cca2:        raw.cca2                || '',
    cca3:        raw.cca3                || '',
    capital:     raw.capital?.[0]        || '—',
    region:      raw.region              || '—',
    subregion:   raw.subregion           || '—',
    continents:  raw.continents          || [],
    population:  raw.population          || 0,
    area:        raw.area                || 0,
    landlocked:  raw.landlocked          || false,
    latlng:      raw.latlng              || [0, 0],
    borders:     raw.borders             || [],
    languages,
    currencies,
    timezones:   raw.timezones           || [],
    callingCode,
    tld:         raw.tld?.[0]            || '—',
    flagPng:     raw.flags?.png          || '',
    flagSvg:     raw.flags?.svg          || '',
    flagAlt:     raw.flags?.alt          || '',
    coatOfArms:  raw.coatOfArms?.png     || '',
    drivingSide: raw.car?.side           || '—',
    unMember:    raw.unMember            || false,
    independent: raw.independent         || false,
    fifa:        raw.fifa                || '',
  };
}

function _nativeName(nameObj) {
  if (!nameObj?.nativeName) return null;
  const first = Object.values(nameObj.nativeName)[0];
  return first?.common || null;
}

/* ── 2. World Bank API ───────────────────────────────────────── */
const WB_BASE = 'https://api.worldbank.org/v2';

/*
  Indicators we fetch:
  NY.GDP.MKTP.CD  — GDP (current USD)
  NY.GDP.PCAP.CD  — GDP per capita (current USD)
  SP.POP.TOTL     — Population (cross-check)
  EN.POP.DNST     — Population density (per km²)
  SP.DYN.LE00.IN  — Life expectancy at birth
  SE.ADT.LITR.ZS  — Adult literacy rate (%)
  SL.UEM.TOTL.ZS  — Unemployment rate (%)
  FP.CPI.TOTL.ZG  — Inflation (CPI, %)
*/
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
  const cacheKey = `wb:${cca2}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  const results = {};
  /* Fetch all indicators in parallel */
  await Promise.allSettled(
    WB_INDICATORS.map(async indicator => {
      try {
        const url = `${WB_BASE}/country/${cca2}/indicator/${indicator}?format=json&mrv=1&per_page=1`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        const val  = json?.[1]?.[0]?.value;
        if (val != null) results[indicator] = val;
      } catch { /* silently skip */ }
    })
  );

  const formatted = {
    gdp:          results['NY.GDP.MKTP.CD']  || null,
    gdpPerCapita: results['NY.GDP.PCAP.CD']  || null,
    density:      results['EN.POP.DNST']     || null,
    lifeExp:      results['SP.DYN.LE00.IN']  || null,
    literacy:     results['SE.ADT.LITR.ZS']  || null,
    unemployment: results['SL.UEM.TOTL.ZS']  || null,
    inflation:    results['FP.CPI.TOTL.ZG']  || null,
  };

  await cacheSet(cacheKey, formatted, 3 * 24 * 60 * 60 * 1000); // 3 days
  return formatted;
}

/** Format World Bank value with units */
export function fmtWB(key, val) {
  if (val == null) return '—';
  switch (key) {
    case 'gdp':          return '$' + fmtNumber(val);
    case 'gdpPerCapita': return '$' + fmtNumber(val);
    case 'density':      return val.toFixed(1) + '/km²';
    case 'lifeExp':      return val.toFixed(1) + ' yrs';
    case 'literacy':     return val.toFixed(1) + '%';
    case 'unemployment': return val.toFixed(1) + '%';
    case 'inflation':    return val.toFixed(1) + '%';
    default:             return String(val);
  }
}

/* ── 3. Wikidata SPARQL ──────────────────────────────────────── */
const WD_ENDPOINT = 'https://query.wikidata.org/sparql';

/** Fetch government type + head of state for a country (by cca2 / ISO code) */
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
    }
    LIMIT 1
  `;

  try {
    const url = `${WD_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/sparql-results+json' }
    });
    if (!res.ok) throw new Error('Wikidata error');
    const json   = await res.json();
    const row    = json.results?.bindings?.[0] || {};

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

/** Get shared international organisations between two countries */
export async function loadSharedOrgs(country1Name, country2Name) {
  const cacheKey = `wd:orgs:${country1Name}:${country2Name}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  const sparql = `
    SELECT ?orgLabel WHERE {
      ?c1 rdfs:label "${country1Name}"@en .
      ?c2 rdfs:label "${country2Name}"@en .
      ?c1 wdt:P463 ?org .
      ?c2 wdt:P463 ?org .
      ?org wdt:P31 wd:Q484652 .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 20
  `;

  try {
    const url  = `${WD_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
    const res  = await fetch(url, {
      headers: { 'Accept': 'application/sparql-results+json' }
    });
    if (!res.ok) throw new Error('Wikidata error');
    const json = await res.json();
    const orgs = (json.results?.bindings || [])
      .map(b => b.orgLabel?.value)
      .filter(Boolean)
      .filter(v => !v.startsWith('Q'));  /* skip unresolved QIDs */

    await cacheSet(cacheKey, orgs, 7 * 24 * 60 * 60 * 1000);
    return orgs;
  } catch {
    return [];
  }
}

/* ── 4. Flag helpers ─────────────────────────────────────────── */

/** Return a reliable flag URL (REST Countries PNG, fallback to flagcdn) */
export function flagUrl(country, size = 'w320') {
  if (country.flagPng) return country.flagPng;
  if (country.cca2)    return `https://flagcdn.com/${size}/${country.cca2.toLowerCase()}.png`;
  return '';
}

/* ── 5. Data summary helpers ────────────────────────────────── */

/** Build a stats object suitable for comparison view */
export function countryStats(country, wb) {
  return {
    population:   { label: 'Population',      value: fmtNumber(country.population),     raw: country.population    },
    area:         { label: 'Area',             value: fmtArea(country.area),             raw: country.area          },
    gdp:          { label: 'GDP',              value: fmtWB('gdp', wb?.gdp),             raw: wb?.gdp               },
    gdpPerCap:    { label: 'GDP/Capita',       value: fmtWB('gdpPerCapita', wb?.gdpPerCapita), raw: wb?.gdpPerCapita },
    lifeExp:      { label: 'Life Expectancy',  value: fmtWB('lifeExp', wb?.lifeExp),     raw: wb?.lifeExp           },
    literacy:     { label: 'Literacy',         value: fmtWB('literacy', wb?.literacy),   raw: wb?.literacy          },
    unemployment: { label: 'Unemployment',     value: fmtWB('unemployment', wb?.unemployment), raw: wb?.unemployment },
  };
}

/* ── 6. Regions / continents filter list ────────────────────── */
export const REGIONS = [
  'All','Africa','Americas','Asia','Europe','Oceania'
];
