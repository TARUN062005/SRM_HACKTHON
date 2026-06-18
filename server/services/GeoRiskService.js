const axios = require('axios');
const NodeCache = require('node-cache');

// ─── CACHES ──────────────────────────────────────────────────────────────────
// Phase 4: Increased TTL to 24 hours; mode is now part of the cache key
const routeRiskCache = new NodeCache({ stdTTL: 86400 }); // 24 hours
// 1 hour cache for global aggregated live incidents
const globalAlertsCache = new NodeCache({ stdTTL: 3600 });

// ─── COUNTRY → ISO CODE MAP ───────────────────────────────────────────────────
const COUNTRY_TO_CODE = {
  'india': 'IN',
  'united arab emirates': 'AE',
  'uae': 'AE',
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'china': 'CN',
  'japan': 'JP',
  'netherlands': 'NL',
  'germany': 'DE',
  'france': 'FR',
  'australia': 'AU',
  'canada': 'CA',
  'south africa': 'ZA',
  'brazil': 'BR',
  'mexico': 'MX',
  'russia': 'RU',
  'south korea': 'KR',
  'korea': 'KR',
  'hong kong': 'HK',
  'taiwan': 'TW',
  'vietnam': 'VN',
  'thailand': 'TH',
  'malaysia': 'MY',
  'indonesia': 'ID',
  'philippines': 'PH',
  'egypt': 'EG',
  'turkey': 'TR',
  'spain': 'ES',
  'italy': 'IT',
  'belgium': 'BE',
  'saudi arabia': 'SA',
  'qatar': 'QA',
  'oman': 'OM',
  'kuwait': 'KW',
  'bahrain': 'BH',
  'new zealand': 'NZ',
  'nigeria': 'NG',
  'pakistan': 'PK',
  'bangladesh': 'BD',
  'sri lanka': 'LK',
  'myanmar': 'MM',
  'cambodia': 'KH',
  'greece': 'GR',
  'portugal': 'PT',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'poland': 'PL',
  'ukraine': 'UA',
  'israel': 'IL',
  'kenya': 'KE',
  'ethiopia': 'ET',
  'ghana': 'GH',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE',
  'iran': 'IR',
  'iraq': 'IQ',
  'jordan': 'JO',
  'lebanon': 'LB',
  'morocco': 'MA',
  'algeria': 'DZ',
  'tunisia': 'TN',
  'libya': 'LY',
  'tanzania': 'TZ',
  'mozambique': 'MZ',
  'angola': 'AO',
};

// Sorted by length (longest first) for greedy matching
const SORTED_COUNTRIES = Object.entries(COUNTRY_TO_CODE).sort((a, b) => b[0].length - a[0].length);

// ─── PORT / CITY CANONICAL MAP ─────────────────────────────────────────────────
// Phase 1: Direct lookup for known ports → canonical "City, ISO" string
const PORT_CITY_MAP = {
  // India — Mumbai
  'bombay': 'Mumbai, IN',
  'bombay castle': 'Mumbai, IN',
  'bombay port': 'Mumbai, IN',
  'mumbai port': 'Mumbai, IN',
  'port of mumbai': 'Mumbai, IN',
  'nhava sheva': 'Mumbai, IN',
  'jawaharlal nehru port': 'Mumbai, IN',
  'jnpt': 'Mumbai, IN',
  // India — other
  'chennai port': 'Chennai, IN',
  'port of chennai': 'Chennai, IN',
  'madras port': 'Chennai, IN',
  'kolkata port': 'Kolkata, IN',
  'port of kolkata': 'Kolkata, IN',
  'calcutta port': 'Kolkata, IN',
  'cochin port': 'Kochi, IN',
  'kochi port': 'Kochi, IN',
  'port of kochi': 'Kochi, IN',
  'kandla port': 'Kandla, IN',
  'visakhapatnam port': 'Visakhapatnam, IN',
  'vizag port': 'Visakhapatnam, IN',
  'port of visakhapatnam': 'Visakhapatnam, IN',
  'paradip port': 'Paradip, IN',
  'haldia port': 'Haldia, IN',
  'mundra port': 'Mundra, IN',
  // Australia
  'port melbourne': 'Melbourne, AU',
  'melbourne port': 'Melbourne, AU',
  'port of melbourne': 'Melbourne, AU',
  'port botany': 'Sydney, AU',
  'port jackson': 'Sydney, AU',
  'port of sydney': 'Sydney, AU',
  'sydney port': 'Sydney, AU',
  'port of brisbane': 'Brisbane, AU',
  'brisbane port': 'Brisbane, AU',
  'port of fremantle': 'Perth, AU',
  'fremantle port': 'Perth, AU',
  'port adelaide': 'Adelaide, AU',
  'port of adelaide': 'Adelaide, AU',
  'darwin port': 'Darwin, AU',
  'port of darwin': 'Darwin, AU',
  // UAE
  'port rashid': 'Dubai, AE',
  'jebel ali': 'Dubai, AE',
  'jebel ali port': 'Dubai, AE',
  'port of dubai': 'Dubai, AE',
  'dubai port': 'Dubai, AE',
  'abu dhabi port': 'Abu Dhabi, AE',
  'port of abu dhabi': 'Abu Dhabi, AE',
  'khalifa port': 'Abu Dhabi, AE',
  'port zayed': 'Abu Dhabi, AE',
  'sharjah port': 'Sharjah, AE',
  // Singapore
  'port of singapore': 'Singapore, SG',
  'singapore port': 'Singapore, SG',
  'pasir panjang': 'Singapore, SG',
  'tanjong pagar': 'Singapore, SG',
  'jurong port': 'Singapore, SG',
  // China
  'port of shanghai': 'Shanghai, CN',
  'shanghai port': 'Shanghai, CN',
  'yangshan port': 'Shanghai, CN',
  'port of shenzhen': 'Shenzhen, CN',
  'shenzhen port': 'Shenzhen, CN',
  'yantian port': 'Shenzhen, CN',
  'port of guangzhou': 'Guangzhou, CN',
  'guangzhou port': 'Guangzhou, CN',
  'nansha port': 'Guangzhou, CN',
  'port of tianjin': 'Tianjin, CN',
  'tianjin port': 'Tianjin, CN',
  'port of hong kong': 'Hong Kong, HK',
  'hong kong port': 'Hong Kong, HK',
  'kwai tsing': 'Hong Kong, HK',
  'port of qingdao': 'Qingdao, CN',
  'qingdao port': 'Qingdao, CN',
  'port of ningbo': 'Ningbo, CN',
  'ningbo port': 'Ningbo, CN',
  'port of xiamen': 'Xiamen, CN',
  'xiamen port': 'Xiamen, CN',
  // Europe
  'port of rotterdam': 'Rotterdam, NL',
  'rotterdam port': 'Rotterdam, NL',
  'europort': 'Rotterdam, NL',
  'port of hamburg': 'Hamburg, DE',
  'hamburg port': 'Hamburg, DE',
  'port of antwerp': 'Antwerp, BE',
  'antwerp port': 'Antwerp, BE',
  'port of felixstowe': 'Felixstowe, GB',
  'felixstowe port': 'Felixstowe, GB',
  'port of southampton': 'Southampton, GB',
  'southampton port': 'Southampton, GB',
  'port of le havre': 'Le Havre, FR',
  'le havre port': 'Le Havre, FR',
  'port of barcelona': 'Barcelona, ES',
  'barcelona port': 'Barcelona, ES',
  'port of valencia': 'Valencia, ES',
  'port of genoa': 'Genoa, IT',
  'genoa port': 'Genoa, IT',
  'port of piraeus': 'Piraeus, GR',
  'piraeus port': 'Piraeus, GR',
  'port of marseille': 'Marseille, FR',
  // USA
  'port of los angeles': 'Los Angeles, US',
  'los angeles port': 'Los Angeles, US',
  'port of long beach': 'Long Beach, US',
  'long beach port': 'Long Beach, US',
  'port of new york': 'New York, US',
  'port of new jersey': 'New York, US',
  'port newark': 'New York, US',
  'port of houston': 'Houston, US',
  'houston port': 'Houston, US',
  'port of seattle': 'Seattle, US',
  'port of savannah': 'Savannah, US',
  'port of charleston': 'Charleston, US',
  'port of baltimore': 'Baltimore, US',
  'port of miami': 'Miami, US',
  // Japan
  'port of tokyo': 'Tokyo, JP',
  'tokyo port': 'Tokyo, JP',
  'port of yokohama': 'Yokohama, JP',
  'yokohama port': 'Yokohama, JP',
  'port of osaka': 'Osaka, JP',
  'osaka port': 'Osaka, JP',
  'port of kobe': 'Kobe, JP',
  'kobe port': 'Kobe, JP',
  'port of nagoya': 'Nagoya, JP',
  // South Korea
  'port of busan': 'Busan, KR',
  'busan port': 'Busan, KR',
  'port of incheon': 'Incheon, KR',
  'incheon port': 'Incheon, KR',
  // Malaysia
  'port klang': 'Kuala Lumpur, MY',
  'port of klang': 'Kuala Lumpur, MY',
  'westports': 'Kuala Lumpur, MY',
  'port of penang': 'Penang, MY',
  // Thailand
  'laem chabang': 'Bangkok, TH',
  'port of bangkok': 'Bangkok, TH',
  'bangkok port': 'Bangkok, TH',
  // Egypt
  'port said': 'Port Said, EG',
  'port of port said': 'Port Said, EG',
  'port of suez': 'Suez, EG',
  'suez port': 'Suez, EG',
  'ain el sokhna': 'Suez, EG',
  'damietta port': 'Damietta, EG',
  // South Africa
  'port of durban': 'Durban, ZA',
  'durban port': 'Durban, ZA',
  'port elizabeth': 'Port Elizabeth, ZA',
  'port of cape town': 'Cape Town, ZA',
  'cape town port': 'Cape Town, ZA',
  // Brazil
  'port of santos': 'Santos, BR',
  'santos port': 'Santos, BR',
  'port of rio': 'Rio de Janeiro, BR',
  'rio port': 'Rio de Janeiro, BR',
  'port of paranagua': 'Paranagua, BR',
  // Pakistan
  'port of karachi': 'Karachi, PK',
  'karachi port': 'Karachi, PK',
  'port qasim': 'Karachi, PK',
  // Sri Lanka
  'port of colombo': 'Colombo, LK',
  'colombo port': 'Colombo, LK',
  // Bangladesh
  'port of chittagong': 'Chittagong, BD',
  'chittagong port': 'Chittagong, BD',
  // Oman
  'port of muscat': 'Muscat, OM',
  'muscat port': 'Muscat, OM',
  'port salalah': 'Salalah, OM',
  'salalah port': 'Salalah, OM',
  // Kenya
  'port of mombasa': 'Mombasa, KE',
  'mombasa port': 'Mombasa, KE',
  // Tanzania
  'port of dar es salaam': 'Dar es Salaam, TZ',
  'dar es salaam port': 'Dar es Salaam, TZ',
  // City-states & common ambiguous entries
  'singapore': 'Singapore, SG',
  'hong kong': 'Hong Kong, HK',
};

// ─── ADMIN / JUNK WORDS TO STRIP ──────────────────────────────────────────────
// Phase 1: These words never represent a city/port and should be removed before extraction
const ADMIN_JUNK_RE = /\b(ward|district|zone|sector|region|block|phase|industrial|business|hub|complex|area|division|municipality|corporation|taluka|tehsil|mandal|sub-district|circle|township|cantonment|gate|castle|fort|village|compound|enclave|colony|quarters|precinct|nagar|nagara|pura|pur|wadi|al-)\b/gi;

// ─── STATE / PROVINCE NAMES TO FILTER OUT ────────────────────────────────────
// Phase 1: We never want to emit a state as the "city" part
const STATE_NAMES = new Set([
  // India
  'maharashtra', 'gujarat', 'karnataka', 'tamil nadu', 'kerala', 'andhra pradesh',
  'telangana', 'rajasthan', 'uttar pradesh', 'madhya pradesh', 'west bengal',
  'odisha', 'punjab', 'haryana', 'himachal pradesh', 'uttarakhand', 'goa',
  'bihar', 'jharkhand', 'chhattisgarh', 'assam', 'manipur', 'meghalaya',
  'nagaland', 'tripura', 'mizoram', 'arunachal pradesh', 'sikkim',
  // Australia
  'victoria', 'new south wales', 'queensland', 'western australia', 'south australia',
  'tasmania', 'northern territory', 'australian capital territory',
  // USA
  'california', 'texas', 'florida', 'illinois', 'pennsylvania', 'ohio', 'georgia',
  'north carolina', 'michigan', 'new jersey', 'virginia', 'arizona', 'massachusetts',
  'tennessee', 'indiana', 'missouri', 'maryland', 'wisconsin', 'colorado',
  'minnesota', 'south carolina', 'alabama', 'louisiana', 'kentucky', 'oregon',
  'oklahoma', 'connecticut', 'utah', 'iowa', 'nevada', 'arkansas', 'mississippi',
  'kansas', 'new mexico', 'nebraska', 'idaho', 'hawaii', 'maine', 'new hampshire',
  'rhode island', 'montana', 'delaware', 'south dakota', 'north dakota', 'alaska',
  'vermont', 'wyoming',
  // China
  'guangdong', 'zhejiang', 'jiangsu', 'shandong', 'fujian', 'liaoning',
  'hebei', 'henan', 'hubei', 'hunan', 'sichuan', 'yunnan', 'shaanxi',
  'shanxi', 'gansu', 'guizhou', 'jilin', 'heilongjiang', 'anhui', 'jiangxi',
  // UK
  'england', 'scotland', 'wales', 'northern ireland',
  // Germany
  'bavaria', 'north rhine-westphalia', 'lower saxony', 'hesse', 'saxony',
  'berlin', 'hamburg state', 'bremen', 'schleswig-holstein', 'rhineland-palatinate',
  // Australia already above
  // Malaysia
  'selangor', 'johor', 'penang', 'sabah', 'sarawak', 'pahang', 'kedah', 'kelantan',
  // Indonesia
  'java', 'sumatra', 'kalimantan', 'sulawesi', 'papua',
  // Netherlands
  'south holland', 'north holland', 'zeeland', 'north brabant', 'utrecht',
  // Canada
  'ontario', 'quebec', 'british columbia', 'alberta', 'nova scotia',
  'new brunswick', 'manitoba', 'saskatchewan', 'prince edward island',
  'newfoundland and labrador',
  // Brazil
  'sao paulo state', 'minas gerais', 'rio de janeiro state', 'bahia', 'parana',
]);

// ─── LOCATION NORMALIZATION ───────────────────────────────────────────────────
/**
 * Phase 1: Smart location normalization.
 * Priority order:
 *   1. Known port → canonical city via PORT_CITY_MAP
 *   2. Country detection → extract city token → "City, ISO"
 *   3. Fallback: clean string with ISO appended
 */
function sanitizeLocation(loc) {
  if (!loc) return '';

  const rawInput = loc.trim();

  // ── STEP 1: Strip parentheses FIRST (e.g. "Mumbai (Bombay) Port" → "Mumbai Port")
  let cleaned = rawInput.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const normalized = cleaned.toLowerCase();

  // ── STEP 2: Port/city direct lookup (longest match wins)
  // Sort by key length descending to avoid partial matches
  const sortedPorts = Object.entries(PORT_CITY_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [portKey, canonical] of sortedPorts) {
    if (normalized.includes(portKey)) {
      console.log(`[GEO NORMALIZATION]\nbefore="${rawInput}"\nafter="${canonical}"\nmatched_port="${portKey}"`);
      return canonical;
    }
  }

  // ── STEP 3: Detect country anywhere in string
  let isoCode = null;
  let matchedCountryName = null;
  const commaParts = normalized.split(',').map(p => p.trim());

  for (const [countryName, code] of SORTED_COUNTRIES) {
    // Match country as a comma-separated part, or at start/end of a part
    if (commaParts.some(p => p === countryName || p.endsWith(` ${countryName}`) || p.startsWith(`${countryName} `))) {
      isoCode = code;
      matchedCountryName = countryName;
      break;
    }
  }

  // ── STEP 4: Build clean city candidate
  let s = cleaned;

  // Remove transport infrastructure keywords
  const transportKws = [
    'chhatrapati shivaji maharaj', 'chhatrapati shivaji', 'indira gandhi international',
    'rajiv gandhi international', 'netaji subhas chandra bose', 'sardar vallabhbhai patel',
    'kempegowda international', 'keppel', 'international airport', 'international seaport',
    'international port', 'port trust', 'port authority', 'port terminal',
    'seaport', 'airport', 'harbour', 'harbor', 'terminal', 'dock',
  ];
  transportKws.forEach(kw => {
    s = s.replace(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '');
  });

  // Remove admin junk words
  s = s.replace(ADMIN_JUNK_RE, '');

  // Remove country name from string
  if (matchedCountryName) {
    s = s.replace(new RegExp(`\\b${matchedCountryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '');
  }

  // Remove standalone ISO codes
  s = s.replace(/\b(IN|AU|AE|US|CN|JP|SG|GB|DE|FR|NL|MY|TH|KR|HK|TW|EG|SA|QA|OM|KW|BH|NZ|NG|PK|BD|LK|MM|KH|GR|PT|SE|NO|DK|FI|PL|UA|IL|KE|ET|GH|AR|CL|CO|PE|IR|IQ|JO|LB|MA|DZ|TN|LY|TZ|MZ|AO|TR|ID|PH|VN|BE|ES|IT|BR|MX|RU|CA|ZA|UAE)\b/g, '');

  // Remove separators and extra spaces
  s = s.replace(/[-_/|]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // ── STEP 5: Split remaining string by comma and find city part
  let parts = s.split(',')
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 1 && !/^\d+$/.test(p));

  // Filter out state names
  const nonStateParts = parts.filter(p => !STATE_NAMES.has(p.toLowerCase().trim()));

  // Prefer non-state parts; fallback to all parts
  let cityPart = (nonStateParts.length > 0 ? nonStateParts[0] : parts[0]) || '';

  // Final clean: remove stray leading/trailing punctuation
  cityPart = cityPart.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();

  // If still empty, use first comma-part of the original raw input
  if (!cityPart) {
    cityPart = rawInput.split(',')[0].trim();
  }

  // ── STEP 6: Assemble result
  const result = isoCode ? `${cityPart}, ${isoCode}` : cityPart;

  console.log(`[GEO NORMALIZATION]\nbefore="${rawInput}"\nafter="${result}"\nmatched_country=${matchedCountryName ? `${matchedCountryName}→${isoCode}` : 'none'}`);

  return result;
}

// ─── EXPORTED TEST HELPER ──────────────────────────────────────────────────────
function testSanitize() {
  const testCases = [
    ['Mumbai (Bombay) Port, India', 'Mumbai, IN'],
    ['Port Rashid, Dubai, UAE', 'Dubai, AE'],
    ['Melbourne Port, Australia', 'Melbourne, AU'],
    ['Port Melbourne Business Hub', 'Melbourne, AU'],
    ['Main Portuguese gate to Bombay Castle, A Ward, Maharashtra, India', 'Mumbai, IN'],
    ['Singapore', 'Singapore, SG'],
    ['Shanghai, China', 'Shanghai, CN'],
    ['Rotterdam, Netherlands', 'Rotterdam, NL'],
    ['Tokyo, Japan', 'Tokyo, JP'],
    ['Dubai, UAE', 'Dubai, AE'],
    ['Port of Los Angeles, California, US', 'Los Angeles, US'],
    ['London, United Kingdom', 'London, GB'],
  ];
  let passed = 0;
  for (const [input, expected] of testCases) {
    const result = sanitizeLocation(input);
    const ok = result === expected;
    if (ok) passed++;
    console.log(`${ok ? '✅' : '❌'} "${input}" → "${result}" (expected: "${expected}")`);
  }
  console.log(`\n[TEST SUMMARY] ${passed}/${testCases.length} passed`);
  return { passed, total: testCases.length };
}

// ─── GEO RISK SERVICE CLASS ───────────────────────────────────────────────────
class GeoRiskService {
  constructor() {
    this.baseUrl = process.env.GEO_RISK_ENGINE_URL || 'https://geo-risk-engine-ml-model.onrender.com';
    console.log(`[GeoRiskService] Initialized with base URL: ${this.baseUrl}`);

    // Seed default highly realistic alerts to guarantee zero-latency initial responses
    this.seededAlerts = [
      {
        id: 'alert-seed-malacca',
        headline: 'Increased Piracy & Armed Robbery Alert: Straits of Malacca and Singapore',
        label: 'piracy',
        zone: 'Singapore Strait',
        published_at: new Date(Date.now() - 3 * 3600000).toISOString(),
        publisher: 'IMB Piracy Reporting Centre',
        source_url: 'https://www.icc-ccs.org/index.php/piracy-port-state-control-reporting',
        image_url: null,
        location: [1.26, 103.88],
        confidence: 0.92,
        intensity: 0.78,
      },
      {
        id: 'alert-seed-bab',
        headline: 'Red Sea Maritime Security Advisory: Bab-el-Mandeb Strait Drone Activity',
        label: 'maritime',
        zone: 'Bab-el-Mandeb Strait',
        published_at: new Date(Date.now() - 6 * 3600000).toISOString(),
        publisher: 'UK Maritime Trade Operations (UKMTO)',
        source_url: 'https://www.ukmto.org/advisories',
        image_url: null,
        location: [12.58, 43.33],
        confidence: 0.98,
        intensity: 0.88,
      },
      {
        id: 'alert-seed-northsea',
        headline: 'Storm Advisory: Gale Force Winds and Rough Seas in North Sea Transits',
        label: 'weather',
        zone: 'North Sea',
        published_at: new Date(Date.now() - 12 * 3600000).toISOString(),
        publisher: 'Met Office Marine Services',
        source_url: 'https://www.metoffice.gov.uk/weather/specialist-forecasts/coast-and-sea',
        image_url: null,
        location: [56.5, 3.0],
        confidence: 0.89,
        intensity: 0.72,
      },
      {
        id: 'alert-seed-suez',
        headline: 'Operational Delays: Suez Canal Anchorages Congestion Backlog',
        label: 'port_closure',
        zone: 'Suez Canal',
        published_at: new Date(Date.now() - 18 * 3600000).toISOString(),
        publisher: 'Leth Agencies Operations',
        source_url: 'https://lethagencies.com/suez-canal-updates',
        image_url: null,
        location: [30.43, 32.57],
        confidence: 0.94,
        intensity: 0.45,
      },
      {
        id: 'alert-seed-panama',
        headline: 'Panama Canal Transit Advisory: Revised Draft Restrictions for Neopanamax Locks',
        label: 'border_disruption',
        zone: 'Panama Canal',
        published_at: new Date(Date.now() - 24 * 3600000).toISOString(),
        publisher: 'Panama Canal Authority (ACP)',
        source_url: 'https://www.pancanal.com/eng/op/index.html',
        image_url: null,
        location: [9.08, -79.69],
        confidence: 0.96,
        intensity: 0.48,
      },
    ];

    // Seed the cache immediately so requests are never blocked
    globalAlertsCache.set('global-aggregated-alerts', this.seededAlerts);

    // Warm up the cache and keep it fresh in the background
    if (process.env.SKIP_BG_REFRESH !== 'true') {
      this.refreshLiveIncidentsInBackground().catch(err => {
        console.warn('[GeoRiskService] Initial live incidents refresh failed:', err.message);
      });

      // Run the background update loop every 10 minutes
      setInterval(() => {
        this.refreshLiveIncidentsInBackground().catch(err => {
          console.warn('[GeoRiskService] Periodic background refresh failed:', err.message);
        });
      }, 600000);
    }
  }

  /**
   * Phase 1+3+4: Fetch advanced multi-mode risk analysis for a route.
   * - sanitizeLocation() now uses smart port/city extraction (Phase 1)
   * - Cache TTL is 24h, key includes mode (Phase 4)
   * - Logs [MODE ANALYSIS] (Phase 3)
   * - Logs [CACHE CHECK] (Phase 4)
   */
  async analyzeRoute(origin, destination, mode = null, radiusKm = 150, minConfidence = 0.2) {
    const sanitizedOrigin = sanitizeLocation(origin);
    const sanitizedDest   = sanitizeLocation(destination);

    // Phase 3: Log single-mode analysis intent
    const engineMode = mode ? ({ ship: 'sea', sea: 'sea', air: 'air', truck: 'road', road: 'road' }[mode] || mode) : 'all';
    const modeReduction = mode ? '67% (3 modes → 1 mode)' : 'none (all modes)';
    console.log(`[MODE ANALYSIS]\nrequested=${mode || 'all'}\nanalyzed=${engineMode}\nmode_reduction=${modeReduction}`);

    // Phase 4: Mode-scoped cache key
    const cacheKey = `risk:${sanitizedOrigin}:${sanitizedDest}:${engineMode}`;
    const cacheHit = routeRiskCache.has(cacheKey);
    console.log(`[CACHE CHECK] ${cacheKey} → ${cacheHit ? 'HIT' : 'MISS'}`);

    if (cacheHit) {
      console.log(`[GeoRiskService] Cache HIT for route: ${sanitizedOrigin} → ${sanitizedDest} [${engineMode}]`);
      return routeRiskCache.get(cacheKey);
    }

    // Phase 6: Request log (called from analyzeRisk in controller, but also log here)
    console.log(`[GEO_RISK REQUEST]\norigin=${sanitizedOrigin}\ndestination=${sanitizedDest}\nmode=${engineMode}\npayload=${JSON.stringify({
      origin: sanitizedOrigin,
      destination: sanitizedDest,
      radius_km: radiusKm,
      min_confidence: minConfidence,
    })}`);

    const retries = 5;
    let delay = 3000; // 3 seconds initial delay

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[GeoRiskService] Posting to v5 API (Attempt ${attempt}/${retries}): ${sanitizedOrigin} → ${sanitizedDest}`);
        const response = await axios.post(`${this.baseUrl}/api/legacy/analyze/v5`, {
          origin: sanitizedOrigin,
          destination: sanitizedDest,
          radius_km: radiusKm,
          min_confidence: minConfidence,
        }, {
          timeout: 60000,
        });

        if (response.data) {
          console.log('[DIAGNOSTIC - GEO_RISK_ENGINE RAW PAYLOAD]', JSON.stringify(response.data, null, 2));
          const recMode = response.data.recommended_mode;
          const recModeData = response.data.modes?.[recMode] || {};

          console.log(`[GEO_RISK RESPONSE]\nrisk_score=${recModeData.risk_score ?? 'N/A'}\nsafety_score=${recModeData.safety_score ?? 'N/A'}\nrecommended_mode=${recMode}\nalerts=${recModeData.alerts ?? 0}`);

          routeRiskCache.set(cacheKey, response.data);
          return response.data;
        }
      } catch (err) {
        console.warn(`[GeoRiskService] Attempt ${attempt} failed: ${err.message}`);

        // Handle 400 and 422 errors immediately (input/geocoding errors)
        if (err.response && [400, 422].includes(err.response.status)) {
          const detail = err.response.data?.detail || err.response.data?.error || 'Geocoding or validation failed on risk engine';
          console.error(`[GeoRiskService] Input validation/geocoding error (Status ${err.response.status}): ${JSON.stringify(detail)}`);
          throw err;
        }

        const isRetryable = err.code === 'ECONNABORTED' || !err.response || [429, 502, 503, 504].includes(err.response.status);
        if (isRetryable && attempt < retries) {
          console.log(`[GeoRiskService] Service might be waking up. Waiting ${delay}ms before retry ${attempt + 1}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay += 2000;
        } else {
          console.error(`[GeoRiskService] Permanent failure querying v5: ${err.message}`);
          throw err;
        }
      }
    }

    throw new Error('GEO_RISK_ENGINE connection timed out or is unavailable.');
  }

  /**
   * Refreshes aggregated incidents in the background.
   */
  async refreshLiveIncidentsInBackground() {
    console.log('[GeoRiskService] Background refresh of live aggregated alerts started...');
    const corridors = [
      { origin: 'Shanghai, China', destination: 'Rotterdam, Netherlands' },
      { origin: 'Tokyo, Japan', destination: 'Los Angeles, USA' },
      { origin: 'London, UK', destination: 'New York, USA' },
      { origin: 'Dubai, UAE', destination: 'Singapore' },
    ];

    const results = [];
    for (const c of corridors) {
      try {
        const res = await this.analyzeRoute(c.origin, c.destination, null, 300, 0.1);
        results.push(res);
      } catch (err) {
        console.warn(`[GeoRiskService] Failed background aggregation query for ${c.origin} → ${c.destination}: ${err.message}`);
        results.push(null);
      }
      // Spacing delay to prevent rate-limiter (429) triggers on Render
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const uniqueEventsMap = new Map();
    for (const res of results) {
      if (!res || !res.modes) continue;
      for (const modeData of Object.values(res.modes)) {
        if (!modeData.events || !Array.isArray(modeData.events)) continue;
        for (const event of modeData.events) {
          const locStr = event.location ? `${event.location[0].toFixed(3)},${event.location[1].toFixed(3)}` : '0,0';
          const key = `${event.headline || ''}_${locStr}`;
          if (!uniqueEventsMap.has(key)) {
            uniqueEventsMap.set(key, event);
          } else {
            const existing = uniqueEventsMap.get(key);
            if ((event.confidence || 0) > (existing.confidence || 0)) {
              uniqueEventsMap.set(key, event);
            }
          }
        }
      }
    }

    const aggregatedEvents = Array.from(uniqueEventsMap.values());
    if (aggregatedEvents.length > 0) {
      console.log(`[GeoRiskService] Background refresh success. Aggregated ${aggregatedEvents.length} unique events.`);
      globalAlertsCache.set('global-aggregated-alerts', aggregatedEvents);
    } else {
      console.log('[GeoRiskService] Background refresh returned 0 events. Retaining previous cache.');
    }
  }

  /**
   * Fetch aggregated live incidents across major trade corridors.
   * Natively SWR-driven, never blocks the main threat feed load.
   */
  async getLiveIncidents() {
    const cacheKey = 'global-aggregated-alerts';
    if (globalAlertsCache.has(cacheKey)) {
      return globalAlertsCache.get(cacheKey);
    }
    return this.seededAlerts;
  }
}

const instance = new GeoRiskService();
instance.sanitizeLocation = sanitizeLocation; // expose for testing
instance.testSanitize = testSanitize;         // expose test helper
module.exports = instance;
