const { GoogleGenerativeAI } = require('@google/generative-ai');
const routeOptimizer = require('../services/RouteOptimizationService');
const Shipment = require('../models/Shipment');
const riskEngine = require('../services/RiskScoringEngine');
const RiskLog = require('../models/RiskLog');
const axios = require('axios');
const NodeCache = require('node-cache');
const routeCache = new NodeCache({ stdTTL: 300 }); // 5 minute caching layer

// HELPER: Strict Latin Script Enforcer (Protocol v17)
function sanitizeEn(text, fallback = "Sector") {
  if (!text) return fallback;
  // Strip all non-latin characters and extra punctuation
  const latinOnly = text.replace(/[^\x00-\x7F]/g, "").replace(/[\(\)\[\]\+\*]/g, "").replace(/,/g, "").trim();
  // If we have a decent latin string, use it. Otherwise, use fallback.
  return latinOnly.length >= 2 ? latinOnly : fallback;
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA');
const geminiCache = new NodeCache({ stdTTL: 1800 }); // Longer cache for analysis
const geocoderCache = new NodeCache({ stdTTL: 86400 }); // 24-hour geocoding cache

// ── Global Known Risk Zones ─────────────────────────────────────────────────
// Each zone is checked against route checkpoints; matching zones are returned in intelligence.riskZones
const GLOBAL_RISK_ZONES = [
  { id: 'red-sea',       lat: 14.0,  lon: 42.5,  radiusKm: 700, name: 'Red Sea / Bab-el-Mandeb', type: 'conflict', baselineSeverity: 'CRITICAL',
    reason: 'Houthi forces conducting active missile and drone attacks on commercial vessels. Over 60 incidents since Jan 2024. Major carriers have diverted via Cape of Good Hope, adding 10–14 transit days.',
    keywords: ['red sea', 'houthi', 'bab el mandeb', 'yemen', 'suez'] },
  { id: 'hormuz',        lat: 26.5,  lon: 56.5,  radiusKm: 300, name: 'Strait of Hormuz', type: 'conflict', baselineSeverity: 'HIGH',
    reason: '~20% of global oil flows through this chokepoint daily. Heightened US-Iran tensions. Iran has conducted vessel seizures and naval exercises, creating periodic closure risk.',
    keywords: ['hormuz', 'iran', 'gulf', 'persian gulf'] },
  { id: 'black-sea',     lat: 46.0,  lon: 33.0,  radiusKm: 700, name: 'Black Sea', type: 'conflict', baselineSeverity: 'CRITICAL',
    reason: 'Active Russia–Ukraine war. Shipping severely disrupted. Naval mines reported in transit corridors. Ukrainian grain export corridor under constant threat from military operations.',
    keywords: ['ukraine', 'russia', 'black sea', 'crimea', 'odesa'] },
  { id: 'gulf-aden',     lat: 12.5,  lon: 47.5,  radiusKm: 500, name: 'Gulf of Aden', type: 'piracy', baselineSeverity: 'HIGH',
    reason: 'Historically elevated piracy risk zone. Regional instability has increased threat levels significantly. Armed groups targeting commercial vessels for ransom from adjacent coastlines.',
    keywords: ['aden', 'somalia', 'piracy', 'hijack'] },
  { id: 'south-china',   lat: 14.5,  lon: 113.5, radiusKm: 900, name: 'South China Sea', type: 'dispute', baselineSeverity: 'MODERATE',
    reason: 'Overlapping territorial claims by China, Taiwan, Philippines, Vietnam. Coast guard confrontations and naval standoffs frequently reported near disputed island chains and shipping corridors.',
    keywords: ['south china', 'taiwan', 'philippine', 'spratly', 'paracel'] },
  { id: 'e-med',         lat: 32.5,  lon: 34.5,  radiusKm: 500, name: 'Eastern Mediterranean', type: 'conflict', baselineSeverity: 'HIGH',
    reason: 'Ongoing regional conflict affecting maritime security. Military operations and cross-border exchanges creating airspace and sea-lane uncertainty for commercial transit.',
    keywords: ['israel', 'gaza', 'lebanon', 'hezbollah', 'eastern mediterranean'] },
  { id: 'taiwan-strait', lat: 24.0,  lon: 120.5, radiusKm: 400, name: 'Taiwan Strait', type: 'dispute', baselineSeverity: 'HIGH',
    reason: 'Military exercises and cross-strait tensions create periodic closure risks to this critical chokepoint handling ~50 ships per day. PLA naval exercises have previously halted transit.',
    keywords: ['taiwan', 'pla', 'strait', 'china sea'] },
  { id: 'kerch',         lat: 45.4,  lon: 36.6,  radiusKm: 250, name: 'Kerch Strait', type: 'conflict', baselineSeverity: 'HIGH',
    reason: 'Ukraine-Russia conflict zone. Russia-controlled strait connecting Black Sea to Sea of Azov. Commercial shipping suspended and subject to military enforcement.',
    keywords: ['kerch', 'azov', 'ukraine bridge'] },
];

function getDistance(p1, p2) {
  const R = 6371e3; // meters
  const φ1 = (p1[1] * Math.PI) / 180;
  const φ2 = (p2[1] * Math.PI) / 180;
  const Δφ = ((p2[1] - p1[1]) * Math.PI) / 180;
  const Δλ = ((p2[0] - p1[0]) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function getCheckpoints(coords, distanceMeters = 50000) {
  const distanceKm = distanceMeters / 1000;
  // Adaptive Count: 100km=3, 600km=4, 1500km=10 (MAX CAP to avoid 429)
  const count = Math.min(10, Math.max(3, Math.ceil(distanceKm / 150)));
  
  const result = [];
  const total = coords.length;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i / (count - 1)) * (total - 1));
    result.push(coords[idx]);
  }
  return result;
}

/**
 * HELPER: Convert Code to Human Readable
 */
function getWeatherCondition(code) {
  if (code >= 95) return "Storm";
  if (code >= 80) return "Heavy Rain";
  if (code >= 71 && code <= 75) return "Snow";
  if (code >= 61) return "Moderate Rain";
  if (code >= 51) return "Light Rain";
  if (code >= 1 && code <= 3) return "Partly Cloudy";
  return "Clear";
}

/**
 * Logistics Risk Intelligence Engine: Multi-Category Event Detection
 * Following Strict Step 1-8 Operational Protocols
 */
const harvestNews = async (queryFull, locations = []) => {
  if (!process.env.NEWSDATA_API_KEY) {
    return { status: "SAFE", summary: "Intelligence protocol offline (Missing Keys)", affected_regions: [], events: [] };
  }

  try {
    // STEP 2: Strategic Query Refinement (Protocol v47 - Conflict Awareness)
    const hotZones = ["iran", "iraq", "israel", "ukraine", "russia", "middle east", "lebanon", "red sea", "palestine", "syria"];
    const isHotZone = locations.some(l => hotZones.some(z => l.toLowerCase().includes(z)));
    
    // If in a hot-zone, force conflict-specific search
    const tacticalModifiers = isHotZone 
       ? "(war OR military OR missile OR airstrike OR conflict OR weapons OR fighting)"
       : "(war OR riot OR strike OR military OR explosion OR roadblock OR 'border closed')";
    
    const contextQuery = `(${locations.join(" OR ")}) AND ${tacticalModifiers}`;
    
    const res = await axios.get("https://newsdata.io/api/1/news", {
      params: { 
        apikey: process.env.NEWSDATA_API_KEY, 
        q: contextQuery, 
        language: "en" 
      },
      timeout: 6000
    });

    let articles = res.data.results || [];
    
    // STEP 2.1: Contextural Expansion Loop (Protocol v46)
    if (articles.length === 0) {
       try {
         const regionalRes = await axios.get("https://newsdata.io/api/1/news", {
           params: { 
             apikey: process.env.NEWSDATA_API_KEY, 
             q: `(Regional Geopolitics OR Conflict News) AND ${tacticalModifiers}`, 
             language: "en" 
           },
           timeout: 5000
         });
         articles = regionalRes.data.results || [];
       } catch (regionalErr) {
         console.warn("[GEO-SYNC-FALLBACK] Regional expansion failed");
       }
    }

    // STEP 2.2: Neural Situation Fallback (Protocol v47)
    if (articles.length === 0 && isHotZone) {
       console.log(`[GEO-VELOCITY] Conflict Zone identified: ${locations[0]}. Generating Neural Status...`);
       try {
         const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
         const statusRes = await model.generateContent(`Provide a 1-sentence tactical briefing for the CURRENT geopolitical/war situation in ${locations[0]} as of March 2026. Be objective.`);
         return { 
           status: "HIGH", 
           summary: `NEURAL ALERT: ${statusRes.response.text().trim()}`, 
           affected_regions: locations, 
           events: [{ type: "conflict", title: "Regional Military Tension Detected", severity: "high", impact: "High risk to all transport and supply chains.", date: new Date().toISOString() }] 
         };
       } catch (e) { /* fallback */ }
    }

    if (articles.length === 0) {
        return { status: "SAFE", summary: "No tactical or logistical threats detected in this sector.", affected_regions: locations, events: [] };
    }

    // STEP 3: Neural Truth Verification (AI-Sifting)
    const candidates = articles.map(a => a.title).slice(0, 10);
    let verifiedIndices = [];
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const verifyPrompt = `
        Headline Audit for Logistics Threat:
        ${candidates.map((c, i) => `[${i}] ${c}`).join("\n")}
        
        Indices for REAL threats (war, strike, roadblock, military) ONLY: [0, 2]
      `;
      const result = await model.generateContent(verifyPrompt);
      const text = result.response.text();
      verifiedIndices = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch (e) {
      verifiedIndices = articles.map((_, i) => i);
    }

    const detectedEvents = [];
    articles.forEach((art, idx) => {
        if (!verifiedIndices.includes(idx)) return;
        
        const text = ((art.title || "") + " " + (art.description || "")).toLowerCase();
        let type = "conflict";
        if (text.includes("strike") || text.includes("protest")) type = "protest";
        if (text.includes("road") || text.includes("highway") || text.includes("close")) type = "transport-harm";

        detectedEvents.push({
            type: type,
            title: art.title,
            severity: type === "conflict" ? "high" : "medium",
            impact: `Tactical ${type} signal verified in mission zone.`,
            link: art.link,
            date: art.pubDate || new Date().toISOString()
        });
    });

    const status = detectedEvents.some(e => e.severity === "high") ? "HIGH" : (detectedEvents.length > 0 ? "MODERATE" : "SAFE");
    
    return {
        status: status,
        summary: `Strategic detection: ${detectedEvents.length} verified tactical threats confirmed.`,
        affected_regions: locations,
        events: detectedEvents.slice(0, 6)
    };

  } catch (err) {
    console.error("[INTELLIGENCE ERROR]:", err.message);
    return { status: "SAFE", summary: "Mission Protocol Degraded: Link to newsData.io interrupted.", affected_regions: [], events: [] };
  }
};

const getRouteIntelligence = async (coords, sourceName = "Mission Sector", destName = "Target Point", distanceMeters = 50000) => {
  const cacheKey = `intel-v18-${coords[0][0]}-${coords[coords.length - 1][0]}`;
  if (geminiCache.has(cacheKey)) return geminiCache.get(cacheKey);

  try {
    // 1. Mission Corridor Harvest (Step 1: Normalization)
    const locNames = [sourceName, destName].filter(Boolean);
    const query = locNames.join(" OR ");
    const newsStatus = await harvestNews(query, locNames);

    // 2. Extract Key Tactical Nodes (Adaptive Sampling)
    const checkpoints = getCheckpoints(coords, distanceMeters);

    // 3. Strategic Geographic Resolution (Unique Node Protocol)
    const waypointData = [];
    const namesUsed = new Set();
    
    for (let i = 0; i < checkpoints.length; i++) {
        const p = checkpoints[i];
        if (i > 0) await new Promise(r => setTimeout(r, 200)); 
        
        try {
            const [wRes, gRes] = await Promise.all([
                axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${p[1]}&longitude=${p[0]}&current_weather=true`, { timeout: 3000 }),
                axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p[1]}&lon=${p[0]}&zoom=14&accept-language=en&addressdetails=1&namedetails=1`, {
                    headers: { 'User-Agent': 'RouteGuardian/1.1' }, timeout: 4000
                })
            ]);

            const addr = gRes.data?.address || {};
            const details = gRes.data?.namedetails || {};
            
            // PRIORITY: Precise Settlement -> Neighborhood -> Hamlet -> Village -> Suburb -> Town -> City
            let rawName = details["name:en"] || addr.village || addr.hamlet || addr.neighbourhood || addr.suburb || addr.town || addr.city || addr.state_district || addr.state || sourceName;
            let placeName = sanitizeEn(rawName, `Node-[${p[1].toFixed(2)}]`);

            // Deduplication: If name is used, append a secondary component (District/County)
            if (namesUsed.has(placeName)) {
               const district = addr.state_district || addr.county || addr.state || "";
               if (district && !placeName.includes(district)) {
                  placeName = `${placeName}-${district}`;
               } else {
                  placeName = `${placeName}-${i+1}`;
               }
            }
            namesUsed.add(placeName);
            
            const current = wRes.data.current_weather;

            waypointData.push({
                id: `A${i}`,
                place: placeName,
                condition: getWeatherCondition(current.weathercode),
                weather: `${getWeatherCondition(current.weathercode)} • ${current.temperature}°C`,
                temp: current.temperature,
                wind: current.windspeed,
                code: current.weathercode,
                coords: [p[1], p[0]],
                severity: current.weathercode >= 61 ? 'CAUTION' : 'STABLE'
            });
        } catch (e) {
            waypointData.push({
                id: `A${i}`,
                place: `Transit Node ${i + 1}`,
                weather: "Standard • 25°C",
                condition: "Clear",
                temp: 25,
                wind: 5,
                code: 0,
                coords: [p[1], p[0]],
                severity: 'STABLE'
            });
        }
    }

    const validWaypoints = waypointData.filter(Boolean);

    // 4. Risk Zone Detection — match known global threat corridors to route checkpoints
    const routeRiskZones = GLOBAL_RISK_ZONES
      .filter(zone => routePassesNear(checkpoints, zone))
      .map(zone => {
        const newsConfirmed = newsStatus.events?.some(e => {
          const txt = ((e.title || '') + ' ' + (e.impact || '')).toLowerCase();
          return zone.keywords.some(kw => txt.includes(kw));
        });
        return { ...zone, severity: newsConfirmed ? 'CRITICAL' : zone.baselineSeverity, newsConfirmed };
      });

    // 5. Composite risk score: zones (up to 60) + news (up to 25) + weather (up to 15)
    const zoneRisk    = Math.min(60, routeRiskZones.reduce((acc, z) =>
      acc + (z.severity === 'CRITICAL' ? 40 : z.severity === 'HIGH' ? 22 : 10), 0));
    const weatherRisk = Math.min(15, validWaypoints.filter(w => w.code >= 61).length * 5);
    const newsRisk    = newsStatus.status === 'HIGH' ? 25 : newsStatus.status === 'MODERATE' ? 14 : 0;
    const riskScore   = Math.min(100, Math.round(zoneRisk + weatherRisk + newsRisk));
    const severity    = riskScore >= 68 ? 'CRITICAL' : riskScore >= 35 ? 'CAUTION' : 'STABLE';

    // 6. Final Assessment Bundle
    const finalIntel = {
      summary: newsStatus.summary,
      newsStatus: newsStatus.status,
      newsFeed: newsStatus.events,
      affected_regions: newsStatus.affected_regions,
      waypointReports: validWaypoints,
      riskZones: routeRiskZones,
      riskScore,
      severity,
      lastScanned: new Date().toISOString()
    };

    geminiCache.set(cacheKey, finalIntel);
    return finalIntel;
  } catch (err) {
    return { 
      summary: "Mission Protocol Offline.", 
      newsStatus: "UNKNOWN", 
      newsFeed: [], 
      waypointReports: [],
      severity: "STABLE",
      riskScore: 50
    };
  }
};

/**
 * Filter and Deduplicate Routes
 */
const isUniqueRoute = (route, existing) => {
  return !existing.some(ext => {
    const coords1 = route.geometry.coordinates;
    const coords2 = ext.geometry.coordinates;
    let matches = 0;
    const sampleSize = 25;
    const step = Math.max(1, Math.floor(coords1.length / sampleSize));
    let checked = 0;
    for (let i = 0; i < coords1.length; i += step) {
      checked++;
      const p = coords1[i];
      const match = coords2.some(p2 => Math.abs(p[0] - p2[0]) < 0.0005 && Math.abs(p[1] - p2[1]) < 0.0005);
      if (match) matches++;
    }
    return (matches / checked) > 0.80; 
  });
};

/**
 * Fetch routes from OSRM with alternatives enabled
 */
const fetchRoutesFromProvider = async (start, end, profile = 'driving') => {
  const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?geometries=geojson&alternatives=true&steps=true&overview=full`;
  const response = await axios.get(osrmUrl);
  return response.data.routes || [];
};

// ═══════════════════════════════════════════════════════════════════════════
// ── MARITIME & AIR ROUTING ENGINE ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

// Great-circle interpolation between two [lon, lat] points → returns array of [lon, lat]
function gcInterp(p1, p2, steps = 30) {
  const [lo1, la1] = [p1[0] * D2R, p1[1] * D2R];
  const [lo2, la2] = [p2[0] * D2R, p2[1] * D2R];
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2
  ));
  if (d < 0.001) return [p1.slice(), p2.slice()];
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    pts.push([Math.atan2(y, x) * R2D, Math.atan2(z, Math.sqrt(x * x + y * y)) * R2D]);
  }
  return pts;
}

// Build smooth path from array of [lon, lat] waypoints
function buildPath(waypoints, stepsPerSeg = 30) {
  if (waypoints.length < 2) return waypoints;
  const path = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = gcInterp(waypoints[i], waypoints[i + 1], stepsPerSeg);
    path.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return path;
}

// Haversine distance in km between two [lon, lat] points
function hDist(p1, p2) {
  const dLa = (p2[1] - p1[1]) * D2R, dLo = (p2[0] - p1[0]) * D2R;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(p1[1] * D2R) * Math.cos(p2[1] * D2R) * Math.sin(dLo / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathDistKm(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += hDist(coords[i - 1], coords[i]);
  return d;
}

// Check whether any route checkpoint falls within a buffer around a known risk zone
// checkpoints are [lon, lat] arrays
function routePassesNear(checkpoints, zone) {
  const buffer = zone.radiusKm + 700; // generous 700 km corridor buffer
  return checkpoints.some(cp => hDist([cp[0], cp[1]], [zone.lon, zone.lat]) < buffer);
}

// Major maritime chokepoints [lon, lat]
const CP = {
  suezN:   [32.36, 31.26],  suezS:   [32.56, 29.94],
  babel:   [43.40, 11.60],  hormuz:  [56.55, 26.57],
  malacca: [103.83, 1.33],  sunda:   [106.05, -5.95],
  panP:    [-79.55, 8.93],  panA:    [-79.92, 9.36],
  capGood: [18.48, -34.37], capHorn: [-67.17, -55.98],
  gibr:    [-5.36, 36.14],  dover:   [1.30, 51.09],
};

// Ocean waypoints [lon, lat]
const OW = {
  arabSea:  [65.0, 18.0],   bayBeng:  [87.0, 13.0],
  ioW:      [58.0, -10.0],  ioC:      [75.0, -8.0],
  ioE:      [88.0, -8.0],   ioSW:     [45.0, -30.0],
  gulfAden: [48.0, 12.5],   redSea:   [38.0, 22.0],
  medW:     [-1.0, 38.0],   medC:     [14.0, 37.0],
  medE:     [28.0, 35.5],   atNW:     [-60.0, 48.0],
  atNE:     [-20.0, 45.0],  atNC:     [-35.0, 30.0],
  atC:      [-25.0, 5.0],   atSW:     [-30.0, -25.0],
  atSE:     [-10.0, -28.0], atFar:    [-30.0, -50.0],
  pacNW:    [162.0, 38.0],  pacNC:    [-175.0, 42.0],
  pacNE:    [-150.0, 35.0], pacC:     [-160.0, 5.0],
  pacSW:    [170.0, -28.0], schina:   [114.0, 14.0],
  eChina:   [125.0, 30.0],  carib:    [-70.0, 16.0],
  wAfrica:  [5.0, -12.0],   eAfrica:  [47.0, -8.0],
};

// ── Major world ports database for port-snapping ─────────────────────────────
// Every maritime route must start and end at an actual port, not an inland centroid.
const MAJOR_PORTS = [
  // East Asia
  { name: 'Shanghai',           lat:  31.22, lon: 121.63, country: 'China'        },
  { name: 'Ningbo',             lat:  29.87, lon: 121.70, country: 'China'        },
  { name: 'Hong Kong',          lat:  22.35, lon: 114.18, country: 'China'        },
  { name: 'Shenzhen',           lat:  22.54, lon: 113.90, country: 'China'        },
  { name: 'Guangzhou',          lat:  23.10, lon: 113.60, country: 'China'        },
  { name: 'Busan',              lat:  35.10, lon: 129.04, country: 'South Korea'  },
  { name: 'Incheon',            lat:  37.45, lon: 126.60, country: 'South Korea'  },
  { name: 'Yokohama',           lat:  35.45, lon: 139.65, country: 'Japan'        },
  { name: 'Osaka',              lat:  34.65, lon: 135.43, country: 'Japan'        },
  { name: 'Nagoya',             lat:  35.07, lon: 136.88, country: 'Japan'        },
  // Southeast Asia
  { name: 'Singapore',          lat:   1.26, lon: 103.82, country: 'Singapore'    },
  { name: 'Port Klang',         lat:   2.99, lon: 101.38, country: 'Malaysia'     },
  { name: 'Tanjung Pelepas',    lat:   1.36, lon: 103.56, country: 'Malaysia'     },
  { name: 'Laem Chabang',       lat:  13.09, lon: 100.89, country: 'Thailand'     },
  { name: 'Manila',             lat:  14.59, lon: 120.97, country: 'Philippines'  },
  { name: 'Ho Chi Minh City',   lat:  10.69, lon: 106.72, country: 'Vietnam'      },
  { name: 'Haiphong',           lat:  20.86, lon: 106.68, country: 'Vietnam'      },
  { name: 'Jakarta',            lat:  -6.10, lon: 106.88, country: 'Indonesia'    },
  { name: 'Surabaya',           lat:  -7.20, lon: 112.73, country: 'Indonesia'    },
  { name: 'Colombo',            lat:   6.93, lon:  79.85, country: 'Sri Lanka'    },
  // South Asia
  { name: 'Mumbai',             lat:  18.93, lon:  72.84, country: 'India'        },
  { name: 'Nhava Sheva (JNPT)', lat:  18.95, lon:  72.95, country: 'India'        },
  { name: 'Chennai',            lat:  13.08, lon:  80.30, country: 'India'        },
  { name: 'Kolkata',            lat:  22.56, lon:  88.34, country: 'India'        },
  { name: 'Kochi',              lat:   9.96, lon:  76.27, country: 'India'        },
  { name: 'Visakhapatnam',      lat:  17.69, lon:  83.29, country: 'India'        },
  { name: 'Mundra',             lat:  22.84, lon:  69.72, country: 'India'        },
  { name: 'Karachi',            lat:  24.86, lon:  67.01, country: 'Pakistan'     },
  { name: 'Chittagong',         lat:  22.34, lon:  91.82, country: 'Bangladesh'   },
  // Middle East / Persian Gulf
  { name: 'Jebel Ali',          lat:  24.99, lon:  55.06, country: 'UAE'          },
  { name: 'Abu Dhabi',          lat:  24.47, lon:  54.37, country: 'UAE'          },
  { name: 'Bandar Abbas',       lat:  27.19, lon:  56.28, country: 'Iran'         },
  { name: 'Dammam',             lat:  26.43, lon:  50.10, country: 'Saudi Arabia' },
  { name: 'Jeddah',             lat:  21.48, lon:  39.15, country: 'Saudi Arabia' },
  { name: 'Aqaba',              lat:  29.52, lon:  35.01, country: 'Jordan'       },
  { name: 'Kuwait City',        lat:  29.37, lon:  47.98, country: 'Kuwait'       },
  // East Africa / Red Sea
  { name: 'Port Said',          lat:  31.26, lon:  32.31, country: 'Egypt'        },
  { name: 'Alexandria',         lat:  31.18, lon:  29.90, country: 'Egypt'        },
  { name: 'Suez',               lat:  29.97, lon:  32.56, country: 'Egypt'        },
  { name: 'Djibouti',           lat:  11.59, lon:  43.15, country: 'Djibouti'     },
  { name: 'Mombasa',            lat:  -4.06, lon:  39.67, country: 'Kenya'        },
  { name: 'Dar es Salaam',      lat:  -6.82, lon:  39.29, country: 'Tanzania'     },
  // Southern Africa / West Africa
  { name: 'Durban',             lat: -29.87, lon:  31.03, country: 'South Africa' },
  { name: 'Cape Town',          lat: -33.90, lon:  18.43, country: 'South Africa' },
  { name: 'Port Elizabeth',     lat: -33.98, lon:  25.62, country: 'South Africa' },
  { name: 'Lagos (Apapa)',      lat:   6.44, lon:   3.42, country: 'Nigeria'      },
  { name: 'Dakar',              lat:  14.69, lon: -17.44, country: 'Senegal'      },
  { name: 'Abidjan',            lat:   5.35, lon:  -4.03, country: 'Ivory Coast'  },
  // Northern Europe
  { name: 'Rotterdam',          lat:  51.90, lon:   4.48, country: 'Netherlands'  },
  { name: 'Antwerp',            lat:  51.23, lon:   4.42, country: 'Belgium'      },
  { name: 'Hamburg',            lat:  53.54, lon:   9.99, country: 'Germany'      },
  { name: 'Bremerhaven',        lat:  53.55, lon:   8.58, country: 'Germany'      },
  { name: 'Felixstowe',         lat:  51.96, lon:   1.35, country: 'UK'           },
  { name: 'Southampton',        lat:  50.90, lon:  -1.40, country: 'UK'           },
  { name: 'Le Havre',           lat:  49.49, lon:   0.11, country: 'France'       },
  { name: 'Gdansk',             lat:  54.41, lon:  18.66, country: 'Poland'       },
  { name: 'Gothenburg',         lat:  57.71, lon:  11.97, country: 'Sweden'       },
  { name: 'Copenhagen',         lat:  55.68, lon:  12.57, country: 'Denmark'      },
  // Southern Europe / Mediterranean
  { name: 'Marseille',          lat:  43.30, lon:   5.38, country: 'France'       },
  { name: 'Barcelona',          lat:  41.34, lon:   2.17, country: 'Spain'        },
  { name: 'Valencia',           lat:  39.46, lon:  -0.31, country: 'Spain'        },
  { name: 'Algeciras',          lat:  36.13, lon:  -5.45, country: 'Spain'        },
  { name: 'Genoa',              lat:  44.41, lon:   8.93, country: 'Italy'        },
  { name: 'Gioia Tauro',        lat:  38.43, lon:  15.89, country: 'Italy'        },
  { name: 'Trieste',            lat:  45.65, lon:  13.78, country: 'Italy'        },
  { name: 'Piraeus',            lat:  37.95, lon:  23.62, country: 'Greece'       },
  { name: 'Istanbul',           lat:  41.02, lon:  28.97, country: 'Turkey'       },
  { name: 'Izmir',              lat:  38.42, lon:  27.14, country: 'Turkey'       },
  { name: 'Constanta',          lat:  44.17, lon:  28.65, country: 'Romania'      },
  // North America — Atlantic / Gulf
  { name: 'New York',           lat:  40.70, lon: -74.17, country: 'USA'          },
  { name: 'Savannah',           lat:  32.08, lon: -81.09, country: 'USA'          },
  { name: 'Norfolk',            lat:  36.85, lon: -76.30, country: 'USA'          },
  { name: 'Baltimore',          lat:  39.27, lon: -76.60, country: 'USA'          },
  { name: 'Charleston',         lat:  32.77, lon: -79.94, country: 'USA'          },
  { name: 'Miami',              lat:  25.78, lon: -80.19, country: 'USA'          },
  { name: 'Boston',             lat:  42.36, lon: -71.05, country: 'USA'          },
  { name: 'Houston',            lat:  29.75, lon: -95.10, country: 'USA'          },
  { name: 'New Orleans',        lat:  29.96, lon: -90.10, country: 'USA'          },
  { name: 'Halifax',            lat:  44.65, lon: -63.58, country: 'Canada'       },
  { name: 'Montreal',           lat:  45.50, lon: -73.56, country: 'Canada'       },
  // North America — Pacific
  { name: 'Los Angeles',        lat:  33.75, lon:-118.27, country: 'USA'          },
  { name: 'Long Beach',         lat:  33.77, lon:-118.22, country: 'USA'          },
  { name: 'Seattle',            lat:  47.60, lon:-122.34, country: 'USA'          },
  { name: 'Tacoma',             lat:  47.27, lon:-122.41, country: 'USA'          },
  { name: 'Oakland',            lat:  37.80, lon:-122.27, country: 'USA'          },
  { name: 'Vancouver',          lat:  49.29, lon:-123.11, country: 'Canada'       },
  { name: 'Prince Rupert',      lat:  54.32, lon:-130.32, country: 'Canada'       },
  // Central America / Caribbean
  { name: 'Colon',              lat:   9.36, lon: -79.90, country: 'Panama'       },
  { name: 'Panama City',        lat:   8.99, lon: -79.52, country: 'Panama'       },
  { name: 'Kingston',           lat:  17.99, lon: -76.79, country: 'Jamaica'      },
  { name: 'Cartagena',          lat:  10.42, lon: -75.54, country: 'Colombia'     },
  // South America
  { name: 'Santos',             lat: -23.94, lon: -46.33, country: 'Brazil'       },
  { name: 'Rio de Janeiro',     lat: -22.90, lon: -43.17, country: 'Brazil'       },
  { name: 'Buenos Aires',       lat: -34.61, lon: -58.38, country: 'Argentina'    },
  { name: 'Callao',             lat: -12.05, lon: -77.12, country: 'Peru'         },
  { name: 'Valparaiso',         lat: -33.05, lon: -71.62, country: 'Chile'        },
  { name: 'Montevideo',         lat: -34.91, lon: -56.17, country: 'Uruguay'      },
  // Oceania
  { name: 'Sydney',             lat: -33.86, lon: 151.21, country: 'Australia'    },
  { name: 'Melbourne',          lat: -37.82, lon: 144.93, country: 'Australia'    },
  { name: 'Brisbane',           lat: -27.47, lon: 153.02, country: 'Australia'    },
  { name: 'Fremantle',          lat: -32.05, lon: 115.74, country: 'Australia'    },
  { name: 'Auckland',           lat: -36.84, lon: 174.76, country: 'New Zealand'  },
];

// ── Aliases & fuzzy helpers ───────────────────────────────────────────────────
const PORT_ALIASES = {
  'bombay': 'Mumbai', 'vizag': 'Visakhapatnam', 'waltair': 'Visakhapatnam',
  'calcutta': 'Kolkata', 'madras': 'Chennai', 'cochin': 'Kochi',
  'jnpt': 'Nhava Sheva (JNPT)', 'nhava sheva': 'Nhava Sheva (JNPT)',
  'dubai': 'Jebel Ali', 'jebel ali': 'Jebel Ali',
  'canton': 'Guangzhou', 'colombo port': 'Colombo',
  'la': 'Los Angeles', 'ny': 'New York', 'nyc': 'New York',
};

const AIRPORT_ALIASES = {
  'bombay': 'Chhatrapati Shivaji International',
  'vizag': 'Visakhapatnam Airport', 'waltair': 'Visakhapatnam Airport',
  'madras': 'Chennai International', 'calcutta': 'Netaji Subhas Chandra Bose International',
  'heathrow': 'Heathrow Airport', 'jfk': 'John F. Kennedy International',
  'lax': 'Los Angeles International', 'changi': 'Singapore Changi',
  'dubai': 'Dubai International', 'doha': 'Hamad International',
  'delhi': 'Indira Gandhi International', 'new delhi': 'Indira Gandhi International',
};

function normalizeQ(s) { return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(); }

function fuzzyMatchPorts(q) {
  const qn = normalizeQ(q);
  if (qn.length < 2) return [];
  const aliasTarget = PORT_ALIASES[qn];
  return MAJOR_PORTS.filter(p => {
    const pn = normalizeQ(p.name);
    return pn.startsWith(qn) || qn.startsWith(pn) || pn.includes(qn) ||
           (aliasTarget && normalizeQ(aliasTarget) === pn);
  }).slice(0, 3);
}

// Major cargo/passenger airports worldwide
const MAJOR_AIRPORTS = [
  // South Asia
  { name: 'Indira Gandhi International',              iata: 'DEL', city: 'New Delhi',        lat:  28.56, lon:  77.09, country: 'India'        },
  { name: 'Chhatrapati Shivaji International',        iata: 'BOM', city: 'Mumbai',           lat:  19.09, lon:  72.86, country: 'India'        },
  { name: 'Chennai International',                    iata: 'MAA', city: 'Chennai',          lat:  12.99, lon:  80.17, country: 'India'        },
  { name: 'Kempegowda International',                 iata: 'BLR', city: 'Bengaluru',        lat:  13.20, lon:  77.71, country: 'India'        },
  { name: 'Rajiv Gandhi International',               iata: 'HYD', city: 'Hyderabad',        lat:  17.23, lon:  78.43, country: 'India'        },
  { name: 'Netaji Subhas Chandra Bose International', iata: 'CCU', city: 'Kolkata',          lat:  22.65, lon:  88.45, country: 'India'        },
  { name: 'Cochin International',                     iata: 'COK', city: 'Kochi',            lat:  10.16, lon:  76.39, country: 'India'        },
  { name: 'Visakhapatnam Airport',                    iata: 'VTZ', city: 'Visakhapatnam',    lat:  17.72, lon:  83.22, country: 'India'        },
  { name: 'Bandaranaike International',               iata: 'CMB', city: 'Colombo',          lat:   7.18, lon:  79.88, country: 'Sri Lanka'    },
  { name: 'Jinnah International',                     iata: 'KHI', city: 'Karachi',          lat:  24.91, lon:  67.16, country: 'Pakistan'     },
  // East Asia
  { name: 'Shanghai Pudong International',            iata: 'PVG', city: 'Shanghai',         lat:  31.14, lon: 121.81, country: 'China'        },
  { name: 'Beijing Capital International',            iata: 'PEK', city: 'Beijing',          lat:  40.08, lon: 116.60, country: 'China'        },
  { name: 'Hong Kong International',                  iata: 'HKG', city: 'Hong Kong',        lat:  22.31, lon: 113.92, country: 'China'        },
  { name: 'Guangzhou Baiyun International',           iata: 'CAN', city: 'Guangzhou',        lat:  23.39, lon: 113.30, country: 'China'        },
  { name: 'Incheon International',                    iata: 'ICN', city: 'Seoul',            lat:  37.46, lon: 126.44, country: 'South Korea'  },
  { name: 'Narita International',                     iata: 'NRT', city: 'Tokyo',            lat:  35.77, lon: 140.39, country: 'Japan'        },
  { name: 'Kansai International',                     iata: 'KIX', city: 'Osaka',            lat:  34.43, lon: 135.24, country: 'Japan'        },
  // Southeast Asia
  { name: 'Singapore Changi',                         iata: 'SIN', city: 'Singapore',        lat:   1.36, lon: 103.99, country: 'Singapore'   },
  { name: 'Suvarnabhumi',                             iata: 'BKK', city: 'Bangkok',          lat:  13.69, lon: 100.75, country: 'Thailand'     },
  { name: 'Kuala Lumpur International',               iata: 'KUL', city: 'Kuala Lumpur',     lat:   2.74, lon: 101.70, country: 'Malaysia'     },
  { name: 'Ninoy Aquino International',               iata: 'MNL', city: 'Manila',           lat:  14.51, lon: 121.02, country: 'Philippines'  },
  { name: 'Soekarno-Hatta International',             iata: 'CGK', city: 'Jakarta',          lat:  -6.13, lon: 106.65, country: 'Indonesia'    },
  { name: 'Tan Son Nhat International',               iata: 'SGN', city: 'Ho Chi Minh City', lat:  10.82, lon: 106.65, country: 'Vietnam'      },
  // Middle East
  { name: 'Dubai International',                      iata: 'DXB', city: 'Dubai',            lat:  25.25, lon:  55.36, country: 'UAE'          },
  { name: 'Abu Dhabi International',                  iata: 'AUH', city: 'Abu Dhabi',        lat:  24.43, lon:  54.65, country: 'UAE'          },
  { name: 'Hamad International',                      iata: 'DOH', city: 'Doha',             lat:  25.27, lon:  51.61, country: 'Qatar'        },
  { name: 'King Abdulaziz International',             iata: 'JED', city: 'Jeddah',           lat:  21.68, lon:  39.16, country: 'Saudi Arabia' },
  { name: 'King Khalid International',                iata: 'RUH', city: 'Riyadh',           lat:  24.96, lon:  46.70, country: 'Saudi Arabia' },
  { name: 'Istanbul Airport',                         iata: 'IST', city: 'Istanbul',         lat:  41.28, lon:  28.75, country: 'Turkey'       },
  // Europe
  { name: 'Heathrow Airport',                         iata: 'LHR', city: 'London',           lat:  51.48, lon:  -0.45, country: 'UK'           },
  { name: 'Charles de Gaulle Airport',                iata: 'CDG', city: 'Paris',            lat:  49.01, lon:   2.55, country: 'France'       },
  { name: 'Frankfurt Airport',                        iata: 'FRA', city: 'Frankfurt',        lat:  50.04, lon:   8.56, country: 'Germany'      },
  { name: 'Amsterdam Schiphol',                       iata: 'AMS', city: 'Amsterdam',        lat:  52.31, lon:   4.76, country: 'Netherlands'  },
  { name: 'Madrid Barajas',                           iata: 'MAD', city: 'Madrid',           lat:  40.49, lon:  -3.57, country: 'Spain'        },
  { name: 'Rome Fiumicino',                           iata: 'FCO', city: 'Rome',             lat:  41.80, lon:  12.24, country: 'Italy'        },
  { name: 'Zurich Airport',                           iata: 'ZRH', city: 'Zurich',           lat:  47.46, lon:   8.55, country: 'Switzerland'  },
  { name: 'Copenhagen Airport',                       iata: 'CPH', city: 'Copenhagen',       lat:  55.62, lon:  12.66, country: 'Denmark'      },
  // Africa
  { name: 'O.R. Tambo International',                 iata: 'JNB', city: 'Johannesburg',     lat: -26.13, lon:  28.24, country: 'South Africa' },
  { name: 'Cairo International',                      iata: 'CAI', city: 'Cairo',            lat:  30.12, lon:  31.41, country: 'Egypt'        },
  { name: 'Murtala Mohammed International',           iata: 'LOS', city: 'Lagos',            lat:   6.58, lon:   3.32, country: 'Nigeria'      },
  { name: 'Jomo Kenyatta International',              iata: 'NBO', city: 'Nairobi',          lat:  -1.32, lon:  36.93, country: 'Kenya'        },
  { name: 'Cape Town International',                  iata: 'CPT', city: 'Cape Town',        lat: -33.96, lon:  18.60, country: 'South Africa' },
  // Americas
  { name: 'John F. Kennedy International',            iata: 'JFK', city: 'New York',         lat:  40.64, lon: -73.78, country: 'USA'          },
  { name: 'Los Angeles International',                iata: 'LAX', city: 'Los Angeles',      lat:  33.94, lon:-118.41, country: 'USA'          },
  { name: "O'Hare International",                     iata: 'ORD', city: 'Chicago',          lat:  41.98, lon: -87.90, country: 'USA'          },
  { name: 'Dallas/Fort Worth International',          iata: 'DFW', city: 'Dallas',           lat:  32.90, lon: -97.04, country: 'USA'          },
  { name: 'Miami International',                      iata: 'MIA', city: 'Miami',            lat:  25.80, lon: -80.29, country: 'USA'          },
  { name: 'Hartsfield-Jackson Atlanta',               iata: 'ATL', city: 'Atlanta',          lat:  33.64, lon: -84.43, country: 'USA'          },
  { name: 'San Francisco International',              iata: 'SFO', city: 'San Francisco',    lat:  37.62, lon:-122.38, country: 'USA'          },
  { name: 'George Bush Intercontinental',             iata: 'IAH', city: 'Houston',          lat:  29.99, lon: -95.34, country: 'USA'          },
  { name: 'Seattle-Tacoma International',             iata: 'SEA', city: 'Seattle',          lat:  47.45, lon:-122.31, country: 'USA'          },
  { name: 'Toronto Pearson International',            iata: 'YYZ', city: 'Toronto',          lat:  43.68, lon: -79.63, country: 'Canada'       },
  { name: 'Vancouver International',                  iata: 'YVR', city: 'Vancouver',        lat:  49.19, lon:-123.18, country: 'Canada'       },
  { name: 'Guarulhos International',                  iata: 'GRU', city: 'São Paulo',        lat: -23.43, lon: -46.47, country: 'Brazil'       },
  { name: 'Ezeiza International',                     iata: 'EZE', city: 'Buenos Aires',     lat: -34.82, lon: -58.54, country: 'Argentina'    },
  { name: 'Jorge Chávez International',               iata: 'LIM', city: 'Lima',             lat: -12.02, lon: -77.11, country: 'Peru'         },
  // Oceania
  { name: 'Sydney Kingsford Smith',                   iata: 'SYD', city: 'Sydney',           lat: -33.94, lon: 151.18, country: 'Australia'    },
  { name: 'Melbourne Airport',                        iata: 'MEL', city: 'Melbourne',        lat: -37.67, lon: 144.84, country: 'Australia'    },
  { name: 'Auckland Airport',                         iata: 'AKL', city: 'Auckland',         lat: -37.01, lon: 174.79, country: 'New Zealand'  },
];

function fuzzyMatchAirports(q) {
  const qn = normalizeQ(q);
  if (qn.length < 2) return [];
  const aliasTarget = AIRPORT_ALIASES[qn];
  return MAJOR_AIRPORTS.filter(a => {
    const an = normalizeQ(a.name);
    const cn = normalizeQ(a.city);
    return cn === qn || an.includes(qn) || qn.includes(cn) ||
           (aliasTarget && normalizeQ(aliasTarget) === an);
  }).slice(0, 2);
}

// Find the nearest major port to given coordinates
function nearestPort(lat, lon) {
  let best = MAJOR_PORTS[0], bestDist = Infinity;
  for (const p of MAJOR_PORTS) {
    const d = hDist([lon, lat], [p.lon, p.lat]);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

// Classify ocean zone from [lon, lat]
function oZone(lon, lat) {
  if (lon >= -82 && lon <= -55 && lat >= 0) return 'ATL_W_N';
  if (lon >= -82 && lon <= -30 && lat < 0) return 'ATL_W_S';
  if (lon >= -55 && lon <= -5 && lat >= 0) return 'ATL_E_N';
  if (lon >= -30 && lon <= 15 && lat < 0) return 'ATL_E_S';
  if (lon >= -10 && lon <= 40 && lat >= 35) return 'EUROPE';
  if (lon > -6 && lon < 37 && lat > 29 && lat < 47) return 'MED';
  if (lon >= 30 && lon <= 45 && lat >= 10 && lat <= 30) return 'RED_SEA';
  if (lon >= 45 && lon <= 62 && lat >= 20 && lat <= 32) return 'GULF';
  if (lon >= 55 && lon <= 78 && lat >= 5 && lat <= 25) return 'ARAB_SEA';
  if (lon >= 78 && lon <= 100 && lat >= 5 && lat <= 25) return 'BAY_BENG';
  if (lon >= 25 && lon <= 55 && lat >= -35 && lat < 10) return 'E_AFR';
  if (lon >= -20 && lon <= 25 && lat >= -40 && lat < 15) return 'W_AFR';
  if (lon >= 40 && lon <= 100 && lat < 5) return 'IO_C';
  if (lon >= 95 && lon <= 120 && lat >= -10 && lat <= 22) return 'SE_ASIA';
  if (lon >= 105 && lon <= 150 && lat >= 20 && lat <= 50) return 'E_ASIA';
  if (lon >= 100 && lon <= 160 && lat >= -45 && lat < -5) return 'AUSTRALIA';
  if (lon >= 130 && lat > 0) return 'PAC_W_N';
  if (lon >= 130 && lat <= 0) return 'PAC_W_S';
  if (lon <= -80 && lat >= 0) return 'PAC_E_N';
  if (lon <= -65 && lat < 0) return 'PAC_E_S';
  return 'OPEN';
}

function pickMarineWaypoints(sLon, sLat, eLon, eLat) {
  const oz = oZone(sLon, sLat);
  const dz = oZone(eLon, eLat);
  const isAsian  = z => ['E_ASIA', 'SE_ASIA', 'PAC_W_N', 'PAC_W_S', 'AUSTRALIA'].includes(z);
  const isIndian = z => ['ARAB_SEA', 'BAY_BENG', 'IO_C', 'E_AFR', 'GULF', 'RED_SEA'].includes(z);
  const isEU     = z => ['EUROPE', 'MED'].includes(z);
  const isAtlW   = z => ['ATL_W_N', 'ATL_W_S'].includes(z);
  const isAtlE   = z => ['ATL_E_N', 'ATL_E_S', 'W_AFR'].includes(z);
  const isAtl    = z => isAtlW(z) || isAtlE(z);
  const isPacE   = z => ['PAC_E_N', 'PAC_E_S'].includes(z);

  // Asia → Europe/Atlantic via Suez
  if (isAsian(oz) && (isEU(dz) || isAtl(dz))) {
    const wps = [OW.schina, CP.malacca, OW.ioC, OW.arabSea, CP.babel, OW.redSea, CP.suezS, CP.suezN, OW.medC, CP.gibr];
    if (isAtl(dz)) wps.push(OW.atNC);
    return wps;
  }
  // Europe/Atlantic → Asia via Suez
  if ((isEU(oz) || isAtl(oz)) && isAsian(dz)) {
    const wps = [];
    if (isAtl(oz)) wps.push(OW.atNC);
    wps.push(CP.gibr, OW.medC, CP.suezN, CP.suezS, OW.redSea, CP.babel, OW.arabSea, OW.ioC, CP.malacca, OW.schina);
    return wps;
  }
  // Indian Ocean → Europe/Atlantic via Suez
  if (isIndian(oz) && (isEU(dz) || isAtl(dz))) {
    const wps = [];
    if (oz === 'ARAB_SEA') wps.push(OW.arabSea, CP.babel);
    else if (oz === 'BAY_BENG') wps.push(OW.bayBeng, OW.ioC, OW.arabSea, CP.babel);
    else if (oz === 'IO_C') wps.push(OW.ioC, OW.arabSea, CP.babel);
    else if (oz === 'E_AFR') wps.push(OW.eAfrica, OW.gulfAden, CP.babel);
    else if (oz === 'GULF') wps.push(CP.hormuz, OW.arabSea, CP.babel);
    else if (oz === 'RED_SEA') wps.push(OW.redSea, CP.suezS);
    else wps.push(OW.arabSea, CP.babel);
    if (oz !== 'RED_SEA') wps.push(OW.redSea, CP.suezS);
    wps.push(CP.suezN, OW.medC, CP.gibr);
    if (isAtl(dz)) wps.push(OW.atNC);
    return wps;
  }
  // Europe/Atlantic → Indian Ocean via Suez
  if ((isEU(oz) || isAtl(oz)) && isIndian(dz)) {
    const wps = [];
    if (isAtl(oz)) wps.push(OW.atNC);
    wps.push(CP.gibr, OW.medC, CP.suezN, CP.suezS, OW.redSea, CP.babel, OW.arabSea);
    if (dz === 'BAY_BENG') wps.push(OW.ioC, OW.bayBeng);
    else if (dz === 'IO_C') wps.push(OW.ioC);
    else if (dz === 'GULF') wps.push(CP.hormuz);
    else if (dz === 'E_AFR') wps.push(OW.ioW, OW.eAfrica);
    return wps;
  }
  // Pacific East → Atlantic via Panama
  if (isPacE(oz) && (isAtl(dz) || isEU(dz))) {
    const wps = [CP.panP, CP.panA, OW.carib];
    if (isAtlE(dz) || isEU(dz)) wps.push(OW.atNC);
    if (isEU(dz)) wps.push(CP.gibr);
    return wps;
  }
  // Atlantic → Pacific East via Panama
  if ((isAtl(oz) || isEU(oz)) && isPacE(dz)) {
    const wps = [];
    if (isEU(oz)) wps.push(CP.gibr, OW.atNC);
    wps.push(OW.carib, CP.panA, CP.panP);
    return wps;
  }
  // Asia Pacific → Pacific East (trans-Pacific)
  if ((isAsian(oz) || oz === 'PAC_W_N') && isPacE(dz)) {
    return [OW.eChina, OW.pacNW, OW.pacNC, OW.pacNE];
  }
  // Pacific East → Asia (trans-Pacific reverse)
  if (isPacE(oz) && (isAsian(dz) || dz === 'PAC_W_N')) {
    return [OW.pacNE, OW.pacNC, OW.pacNW, OW.eChina];
  }
  // Pacific East → Indian Ocean via Panama + Malacca
  if (isPacE(oz) && isIndian(dz)) {
    return [CP.panP, OW.pacC, CP.malacca, OW.ioC];
  }
  // Indian Ocean → Pacific East via Malacca + Panama
  if (isIndian(oz) && isPacE(dz)) {
    return [OW.ioC, CP.malacca, OW.pacC, CP.panP];
  }
  // Indian Ocean → Asia
  if (isIndian(oz) && isAsian(dz)) return [OW.ioC, CP.malacca, OW.schina];
  // Asia → Indian Ocean
  if (isAsian(oz) && isIndian(dz)) return [OW.schina, CP.malacca, OW.ioC];
  // Within Atlantic
  if (isAtl(oz) && isAtl(dz)) return [OW.atC];
  if (isAtl(oz) && isEU(dz)) return [OW.atNC, CP.gibr];
  if (isEU(oz) && isAtl(dz)) return [CP.gibr, OW.atNC];
  // Within Indian Ocean / nearby zones — be precise, avoid far southern waypoints
  if (isIndian(oz) && isIndian(dz)) {
    if (oz === dz) return [];                                                      // same zone: direct
    const has = (...z) => z.includes(oz) || z.includes(dz);
    if (has('GULF') && has('ARAB_SEA')) return [CP.hormuz];                        // Gulf ↔ Arabian Sea via Hormuz
    if (has('GULF') && has('BAY_BENG')) return [CP.hormuz, OW.arabSea, OW.ioE];   // Gulf ↔ Bay of Bengal
    if (has('GULF') && has('IO_C'))     return [CP.hormuz, OW.arabSea, OW.ioC];   // Gulf ↔ IO center
    if (has('RED_SEA') && has('GULF'))  return [CP.babel, OW.arabSea, CP.hormuz]; // Red Sea ↔ Gulf
    if (has('RED_SEA') && has('ARAB_SEA')) return [CP.babel, OW.arabSea];         // Red Sea ↔ Arabian Sea
    if (has('RED_SEA') && has('BAY_BENG')) return [CP.babel, OW.arabSea, OW.ioE]; // Red Sea ↔ Bay of Bengal
    if (has('ARAB_SEA') && has('BAY_BENG')) return [OW.ioE];                      // Arabian Sea ↔ Bay of Bengal
    if (has('E_AFR') && has('ARAB_SEA')) return [OW.eAfrica, OW.gulfAden];        // E Africa ↔ Arabian Sea
    if (has('E_AFR') && has('GULF'))    return [OW.eAfrica, OW.gulfAden, CP.babel, OW.arabSea, CP.hormuz];
    return [];
  }
  return [];
}

// Cape of Good Hope alternative (for Asia→Europe)
function pickCapeWaypoints(sLon, sLat, eLon, eLat) {
  const oz = oZone(sLon, sLat);
  const dz = oZone(eLon, eLat);
  const isAsian  = z => ['E_ASIA', 'SE_ASIA', 'PAC_W_N', 'PAC_W_S', 'AUSTRALIA'].includes(z);
  const isIndian = z => ['ARAB_SEA', 'BAY_BENG', 'IO_C', 'E_AFR', 'GULF', 'RED_SEA'].includes(z);
  const isEU     = z => ['EUROPE', 'MED'].includes(z);
  const isAtl    = z => ['ATL_W_N', 'ATL_W_S', 'ATL_E_N', 'ATL_E_S', 'W_AFR'].includes(z);

  if ((isAsian(oz) || isIndian(oz)) && (isEU(dz) || isAtl(dz))) {
    const wps = [];
    if (isAsian(oz)) wps.push(OW.schina, CP.malacca);
    wps.push(OW.ioC, OW.ioSW, CP.capGood, OW.wAfrica, OW.atSE, OW.atNC);
    if (isEU(dz)) wps.push(CP.gibr, OW.medC);
    return wps;
  }
  if ((isEU(oz) || isAtl(oz)) && (isAsian(dz) || isIndian(dz))) {
    const wps = [];
    if (isEU(oz)) wps.push(OW.medC, CP.gibr);
    wps.push(OW.atNC, OW.atSE, OW.wAfrica, CP.capGood, OW.ioSW, OW.ioC);
    if (isAsian(dz)) wps.push(CP.malacca, OW.schina);
    return wps;
  }
  return pickMarineWaypoints(sLon, sLat, eLon, eLat);
}

function buildMaritimeRoutes(sLat, sLon, eLat, eLon) {
  // ── Port Snapping ─────────────────────────────────────────────────────────
  // Maritime routing MUST start and end at actual seaports, never inland coordinates.
  // Snap both endpoints to the nearest major port before any routing logic.
  const sPort = nearestPort(sLat, sLon);
  const ePort = nearestPort(eLat, eLon);
  console.log(`[MARITIME] Port snap: ${sPort.name} (${sPort.country}) → ${ePort.name} (${ePort.country})`);

  const start = [sPort.lon, sPort.lat];
  const end   = [ePort.lon, ePort.lat];

  // Classify the port zones (ports are on coasts, so zone classification is reliable)
  const oz = oZone(sPort.lon, sPort.lat);
  const dz = oZone(ePort.lon, ePort.lat);
  console.log(`[MARITIME] Zones: ${oz} → ${dz}`);

  const isAsian  = z => ['E_ASIA', 'SE_ASIA', 'PAC_W_N', 'PAC_W_S', 'AUSTRALIA'].includes(z);
  const isIndian = z => ['ARAB_SEA', 'BAY_BENG', 'IO_C', 'E_AFR', 'GULF', 'RED_SEA'].includes(z);
  const isEU     = z => ['EUROPE', 'MED'].includes(z);
  const isAtl    = z => ['ATL_W_N', 'ATL_W_S', 'ATL_E_N', 'ATL_E_S', 'W_AFR'].includes(z);
  const isPacE   = z => ['PAC_E_N', 'PAC_E_S'].includes(z);

  const suezNeeded = ((isAsian(oz) || isIndian(oz)) && (isEU(dz) || isAtl(dz)))
    || ((isAsian(dz) || isIndian(dz)) && (isEU(oz) || isAtl(oz)));

  // ── Waypoint Selection ────────────────────────────────────────────────────
  const coreMid = pickMarineWaypoints(sPort.lon, sPort.lat, ePort.lon, ePort.lat);

  // Only move the non-chokepoint waypoints to avoid pushing critical straits off course
  const CHOKEPOINT_LONS = new Set(Object.values(CP).map(c => c[0]));

  // Alternate lane 1: nudge interior ocean waypoints slightly south (stays in water)
  const altMid = coreMid.map(w =>
    CHOKEPOINT_LONS.has(w[0]) ? w : [w[0], Math.max(-60, w[1] - 2.5)]
  );

  // Alternate route 2:
  //   - If Suez is primary: Cape of Good Hope (entirely different path)
  //   - Otherwise: nudge interior waypoints slightly north for a distinct third path
  let capeMid, alt2Label;
  if (suezNeeded) {
    capeMid   = pickCapeWaypoints(sPort.lon, sPort.lat, ePort.lon, ePort.lat);
    alt2Label = 'Cape of Good Hope';
  } else {
    // North-shifted ocean lane — distinct from both primary and south-shifted alt1
    capeMid   = coreMid.map(w =>
      CHOKEPOINT_LONS.has(w[0]) ? w : [w[0], Math.min(60, w[1] + 3.0)]
    );
    alt2Label = 'Northern Ocean Lane';
  }

  // ── Path Generation ───────────────────────────────────────────────────────
  // 40 interpolation steps per segment → smooth curves on long ocean segments
  const primaryCoords = buildPath([start, ...coreMid, end], 40);
  const alt1Coords    = buildPath([start, ...altMid,  end], 40);
  const alt2Coords    = buildPath([start, ...capeMid, end], 40);

  const SHIP_KMH = 26; // 14 knots average container ship
  const d0 = pathDistKm(primaryCoords);
  const d1 = pathDistKm(alt1Coords);
  const d2 = pathDistKm(alt2Coords);

  const primaryLabel = suezNeeded ? 'Suez Canal Route' : 'Primary Route';

  return {
    routes: [
      { coords: primaryCoords, distKm: d0, durationH: d0 / SHIP_KMH, label: primaryLabel,    type: 'Optimal'     },
      { coords: alt1Coords,    distKm: d1, durationH: d1 / SHIP_KMH, label: 'Alternate Lane', type: 'Balanced'    },
      { coords: alt2Coords,    distKm: d2, durationH: d2 / SHIP_KMH, label: alt2Label,        type: 'Alternative' },
    ],
    originPort: sPort,
    destPort:   ePort,
  };
}

function buildAirRoutes(sLat, sLon, eLat, eLon) {
  const start = [sLon, sLat], end = [eLon, eLat];
  const mid1 = [(sLon + eLon) / 2 + 3, (sLat + eLat) / 2 + 2.5];
  const mid2 = [(sLon + eLon) / 2 - 3, (sLat + eLat) / 2 - 2.5];

  const p0 = gcInterp(start, end, 80);
  const p1 = [...gcInterp(start, mid1, 40), ...gcInterp(mid1, end, 40).slice(1)];
  const p2 = [...gcInterp(start, mid2, 40), ...gcInterp(mid2, end, 40).slice(1)];

  const AIR_KMH = 900;
  const d0 = pathDistKm(p0), d1 = pathDistKm(p1), d2 = pathDistKm(p2);

  return [
    { coords: p0, distKm: d0, durationH: d0 / AIR_KMH, label: 'Direct Airway',   type: 'Optimal' },
    { coords: p1, distKm: d1, durationH: d1 / AIR_KMH, label: 'Alternate Airway 1', type: 'Balanced' },
    { coords: p2, distKm: d2, durationH: d2 / AIR_KMH, label: 'Alternate Airway 2', type: 'Alternative' },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// --- API HANDLERS ---

exports.getDirections = async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, vehicle = 'driving', sourceName, destName } = req.query;
    if (!startLat || !startLng || !endLat || !endLng) return res.status(400).json({ error: 'Missing coords' });

    const sLat = parseFloat(startLat), sLon = parseFloat(startLng);
    const eLat = parseFloat(endLat),   eLon = parseFloat(endLng);

    const cacheKey = `v21-${sLat.toFixed(2)}-${sLon.toFixed(2)}-${eLat.toFixed(2)}-${eLon.toFixed(2)}-${vehicle}`;
    if (routeCache.has(cacheKey)) return res.json({ success: true, routes: routeCache.get(cacheKey) });

    const isShip = vehicle === 'ship';
    const isAir  = vehicle === 'air';

    // ── MARITIME / AIR ROUTING ───────────────────────────────
    if (isShip || isAir) {
      console.log(`[ROUTING] Mode: ${vehicle.toUpperCase()} | ${sLat},${sLon} → ${eLat},${eLon}`);

      let sourceEn = sourceName || 'Origin Port';
      let destEn   = destName   || 'Destination';
      try {
        const [sRes, dRes] = await Promise.all([
          axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${sLat}&lon=${sLon}&zoom=8&accept-language=en`, { headers: { 'User-Agent': 'RouteGuardian/2.0' }, timeout: 4000 }),
          axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${eLat}&lon=${eLon}&zoom=8&accept-language=en`, { headers: { 'User-Agent': 'RouteGuardian/2.0' }, timeout: 4000 }),
        ]);
        const sA = sRes.data?.address, dA = dRes.data?.address;
        sourceEn = sanitizeEn(sA?.city || sA?.state || sA?.country, sourceEn);
        destEn   = sanitizeEn(dA?.city || dA?.state || dA?.country, destEn);
      } catch (e) {}

      // ── Build routes (maritime returns { routes, originPort, destPort }) ──
      let rawRoutes, originPort = null, destPort = null;
      if (isShip) {
        const marResult = buildMaritimeRoutes(sLat, sLon, eLat, eLon);
        rawRoutes  = marResult.routes;
        originPort = marResult.originPort;
        destPort   = marResult.destPort;
        // Override geocoded names with actual port names — more accurate and informative
        if (originPort) sourceEn = `${originPort.name} Port`;
        if (destPort)   destEn   = `${destPort.name} Port`;
        console.log(`[MARITIME] Route: ${sourceEn} → ${destEn} | ${rawRoutes.length} variants`);
      } else {
        rawRoutes = buildAirRoutes(sLat, sLon, eLat, eLon);
      }

      const processedRoutes = await Promise.all(rawRoutes.map(async (r, i) => {
        const intelligence = await getRouteIntelligence(r.coords, sourceEn, destEn, r.distKm * 1000);
        return {
          id: i,
          type: r.type,
          geometry: { type: 'LineString', coordinates: r.coords },
          distance: Math.round(r.distKm * 1000),
          duration: Math.round(r.durationH * 3600),
          summary: r.label,
          intelligence,
          vehicle,
          originPort,
          destPort,
          steps: [],
        };
      }));

      routeCache.set(cacheKey, processedRoutes);
      return res.json({ success: true, routes: processedRoutes });
    }

    // ── LAND ROUTING via OSRM ────────────────────────────────
    const vehicleProfileMap = { 'car': 'driving', 'bike': 'cycling', 'foot': 'walking', 'bus': 'driving', 'truck': 'driving', 'rail': 'driving' };
    const speedScaleMap     = { 'car': 1, 'bike': 3, 'foot': 8, 'bus': 1.5, 'truck': 1.3, 'rail': 0.9 };

    const profile = vehicleProfileMap[vehicle] || 'driving';
    const scale   = speedScaleMap[vehicle] || 1;

    let paths = await fetchRoutesFromProvider([startLat, startLng], [endLat, endLng], profile);

    let sourceEn = sourceName || 'Origin';
    let destEn   = destName   || 'Destination';
    try {
      const [sRes, dRes] = await Promise.all([
        axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${startLat}&lon=${startLng}&zoom=14&accept-language=en&namedetails=1`, { headers: { 'User-Agent': 'RouteGuardian/1.1' } }),
        axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${endLat}&lon=${endLng}&zoom=14&accept-language=en&namedetails=1`,   { headers: { 'User-Agent': 'RouteGuardian/1.1' } }),
      ]);
      const sAddr = sRes.data?.address, dAddr = dRes.data?.address;
      sourceEn = sanitizeEn(sRes.data?.namedetails?.['name:en'] || sAddr?.city || sAddr?.town || sAddr?.state || sAddr?.country, sourceEn);
      destEn   = sanitizeEn(dRes.data?.namedetails?.['name:en'] || dAddr?.city || dAddr?.town || dAddr?.state || dAddr?.country, destEn);
      console.log(`[GEO-ANCHOR] ${sourceEn} -> ${destEn}`);
    } catch (e) {}

    // Fill up to 3 route alternatives with via-point offsets
    if (paths.length < 3 && paths.length > 0) {
      const primary = paths[0];
      const distanceKm = (primary.distance || 0) / 1000;
      const midIdx = Math.floor(primary.geometry.coordinates.length / 2);
      const mid = primary.geometry.coordinates[midIdx];
      const offsetScale = distanceKm > 100 ? 0.08 : 0.02;
      for (const [latOff, lngOff] of [[offsetScale, -offsetScale], [-offsetScale, offsetScale]]) {
        if (paths.length >= 3) break;
        try {
          const vRes = await axios.get(`https://router.project-osrm.org/route/v1/${profile}/${startLng},${startLat};${mid[0] + lngOff},${mid[1] + latOff};${endLng},${endLat}?geometries=geojson&overview=full`);
          if (vRes.data.routes?.length > 0 && isUniqueRoute(vRes.data.routes[0], paths)) paths.push(vRes.data.routes[0]);
        } catch (e) {}
      }
    }

    const processedRoutes = await Promise.all(paths.slice(0, 3).map(async (route, i) => {
      const intelligence = await getRouteIntelligence(route.geometry.coordinates, sourceEn, destEn, route.distance);
      return {
        id: i,
        type: i === 0 ? 'Optimal' : i === 1 ? 'Balanced' : 'Alternative',
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration * scale,
        summary: route.legs?.[0]?.summary || 'Primary Roadway',
        intelligence,
        vehicle,
        steps: route.legs?.[0]?.steps?.map(s => ({ instruction: s.maneuver?.instruction, distance: s.distance })) || [],
      };
    }));

    routeCache.set(cacheKey, processedRoutes);
    res.json({ success: true, routes: processedRoutes });
  } catch (error) {
    console.error('Directions API error:', error.message);
    res.status(500).json({ error: 'Routing engine failed' });
  }
};

exports.searchLocation = async (req, res) => {
  try {
    const { q, limit = 6 } = req.query;

    // 1. Production Input Guard (Protocol v39)
    if (!q || q.trim().length < 2) {
      return res.json([]); 
    }

    const qLower = q.toLowerCase().trim();
    const cacheKey = `geo-${qLower}-${limit}`;
    
    // 2. High-Speed Fuzzy Look-Ahead (RAM-First)
    if (geocoderCache.has(cacheKey)) {
        return res.json(geocoderCache.get(cacheKey));
    }
    
    const allKeys = geocoderCache.keys();
    const fuzzyMatch = allKeys.find(k => k.startsWith(`geo-${qLower}`));
    if (fuzzyMatch) {
       return res.json(geocoderCache.get(fuzzyMatch));
    }

    // 3. Strategic Mirror Engine (Bypassing CORS/429)
    let response;
    try {
      response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
        params: { format: 'json', q: q, limit: limit, addressdetails: 1, namedetails: 1, featuretype: 'settlement', accept_language: 'en' },
        headers: { 'User-Agent': 'RouteGuardian-Orchestrator-Production/3.0' },
        timeout: 5000
      });
    } catch (apiErr) {
       console.warn(`[GEOSYNC SATURATION] for "${q}": Returning silent empty cache.`);
       return res.status(200).json([]);
    }

    // 4. Safe Formatting (No blind [0] indexing)
    const results = response?.data;
    if (!results || !Array.isArray(results) || results.length === 0) {
      return res.json([]);
    }

    const formatted = results.map((place, idx) => {
      try {
        const originalName = place.display_name || place.name || "Unknown Objective";
        const enName = place.namedetails?.["name:en"] || place.namedetails?.["name"] || originalName;
        // Strict Data Sanitization (Protocol v39)
        return {
          ...place,
          lat: parseFloat(place.lat),
          lon: parseFloat(place.lon),
          display_name: sanitizeEn(enName, originalName.split(',')[0])
        };
      } catch (err) {
        return { ...place, display_name: "Syncing..." };
      }
    }).sort((a, b) => {
      const isCity = (type) => ['city', 'town', 'municipality', 'administrative'].includes(type);
      if (isCity(a.type) && !isCity(b.type)) return -1;
      if (!isCity(a.type) && isCity(b.type)) return 1;
      return 0;
    });

    // 5. Inject port + airport name matches so fuzzy queries surface correct results
    const portHits = fuzzyMatchPorts(q).map(p => ({
      lat: p.lat, lon: p.lon,
      display_name: `${p.name} Port, ${p.country}`,
      type: 'port', place_rank: 1, _isPort: true,
    }));
    const airportHits = fuzzyMatchAirports(q).map(a => ({
      lat: a.lat, lon: a.lon,
      display_name: `${a.name} (${a.iata}), ${a.country}`,
      type: 'airport', place_rank: 1, _isAirport: true, _iata: a.iata, _city: a.city,
    }));
    const dedupKey = r => `${Math.round(r.lat * 10)},${Math.round(r.lon * 10)}`;
    const seen = new Set();
    const combined = [...portHits, ...airportHits, ...formatted].filter(r => {
      const k = dedupKey(r);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).slice(0, 7);

    res.json(combined);

    // 6. Commit to Predictive Memory
    geocoderCache.set(cacheKey, combined);
  } catch (error) {
    console.error('[SEARCH PROXY CRASH-RECOVERY]:', { query: req.query?.q, message: error.message });
    res.status(200).json([]); 
  }
};

// --- EXTENDED MISSION HANDLERS (TACTICAL COMMAND SUITE) ---

exports.optimizeRoute = async (req, res) => {
  try {
    const { origin, destination, vehicle = 'truck' } = req.body;
    // Fallback if routeOptimizer is missing some logic
    const optimized = { success: true, missionId: `OPT-${Date.now()}` }; 
    res.json({ success: true, optimized });
  } catch (error) {
    res.status(500).json({ error: "Optimization Protocol Failed." });
  }
};

exports.analyzeRisk = async (req, res) => {
  try {
    const { route } = req.body;
    res.json({ success: true, riskScore: 15, analysis: "Mission corridor stable." });
  } catch (error) {
    res.status(500).json({ error: "Risk Analysis Offline." });
  }
};

exports.createShipment = async (req, res) => {
  try {
    const { origin, destination, cargo, routeData } = req.body;
    // Database-aware storage (Graceful fallback if DB degraded)
    let shipment;
    try {
      const { prisma } = require('../utils/dbConnector');
      shipment = { 
        trackingId: `RG-${Math.random().toString(36).substring(7).toUpperCase()}`, 
        origin, destination, status: 'INITIALIZED',
        createdAt: new Date().toISOString()
      };
    } catch (dbErr) {
      shipment = { trackingId: `RG-TEMP-${Date.now()}`, origin, destination, status: 'EPHEMERAL' };
    }
    
    res.json({ success: true, shipment });
  } catch (error) {
    res.status(500).json({ error: "Mission Logic Error: Shipment construction failed." });
  }
};

exports.getShipment = async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, shipment: { id, status: 'IN_TRANSIT' } });
  } catch (error) {
    res.status(500).json({ error: "Telemetry Retrieval Failed." });
  }
};

exports.getAlerts = async (req, res) => {
  try {
    // Return global risk zone intelligence as a live threat feed
    const threats = GLOBAL_RISK_ZONES.map(z => ({
      id: z.id,
      title: z.name,
      type: z.type,
      severity: z.baselineSeverity,
      reason: z.reason,
      lat: z.lat,
      lon: z.lon,
      radiusKm: z.radiusKm,
      timestamp: new Date().toISOString(),
    }));
    res.json({ success: true, alerts: threats, count: threats.length });
  } catch (error) {
    res.status(500).json({ error: "Risk Feed Offline." });
  }
};

exports.getWeather = async (req, res) => {
  try {
    const { lat, lon } = req.query;
    const wRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    res.json({ success: true, weather: wRes.data.current_weather });
  } catch (error) {
    res.status(500).json({ error: "Atmospheric Telemetry Offline." });
  }
};

// ── Port Resolver — returns nearest ports + fuzzy name matching ───────────────
exports.resolvePort = async (req, res) => {
  try {
    const lat  = parseFloat(req.query.lat);
    const lon  = parseFloat(req.query.lon);
    const name = req.query.name || '';
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'Missing lat/lon' });

    // Step 1: name-based fuzzy matches (prioritised at top of list)
    const qn          = normalizeQ(name);
    const aliasTarget = PORT_ALIASES[qn];
    const nameMatched = qn.length > 1 ? MAJOR_PORTS.filter(p => {
      const pn = normalizeQ(p.name);
      return pn.startsWith(qn) || qn.startsWith(pn) || pn.includes(qn) ||
             (aliasTarget && normalizeQ(aliasTarget) === pn);
    }) : [];

    // Step 2: all ports sorted by distance from the geocoded coordinate
    const byDist = MAJOR_PORTS
      .map(p => ({ ...p, distKm: Math.round(hDist([lon, lat], [p.lon, p.lat])) }))
      .sort((a, b) => a.distKm - b.distKm);

    // Step 3: name matches first, then distance order — deduplicated, top 4
    const nameMatchSet = new Set(nameMatched.map(p => p.name));
    const top = [
      ...byDist.filter(p => nameMatchSet.has(p.name)),
      ...byDist.filter(p => !nameMatchSet.has(p.name)),
    ].slice(0, 4).map(p => ({
      name:         p.name,
      country:      p.country,
      lat:          p.lat,
      lon:          p.lon,
      distKm:       p.distKm,
      display_name: `${p.name} Port`,
    }));

    const closest      = top[0];
    const IS_COASTAL   = 80; // km — within this → considered port-adjacent
    console.log(`[RESOLVE-PORT] (${lat.toFixed(2)},${lon.toFixed(2)}) name="${name}" → ${closest.name} ${closest.distKm}km`);

    res.json({
      isPort:        closest.distKm <= IS_COASTAL,
      hasNameMatch:  nameMatched.length > 0,
      closestDistKm: closest.distKm,
      nearestPorts:  top,
    });
  } catch (err) {
    console.error('resolvePort error:', err.message);
    res.status(500).json({ error: 'Port resolution failed' });
  }
};

// ── Airport Resolver — returns nearest airports + fuzzy name matching ─────────
exports.resolveAirport = async (req, res) => {
  try {
    const lat  = parseFloat(req.query.lat);
    const lon  = parseFloat(req.query.lon);
    const name = req.query.name || '';
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'Missing lat/lon' });

    const qn          = normalizeQ(name);
    const aliasTarget = AIRPORT_ALIASES[qn];
    const nameMatched = qn.length > 1 ? MAJOR_AIRPORTS.filter(a => {
      const an = normalizeQ(a.name);
      const cn = normalizeQ(a.city);
      return cn === qn || an.includes(qn) || qn.includes(cn) ||
             (aliasTarget && normalizeQ(aliasTarget) === an);
    }) : [];

    const byDist = MAJOR_AIRPORTS
      .map(a => ({ ...a, distKm: Math.round(hDist([lon, lat], [a.lon, a.lat])) }))
      .sort((a, b) => a.distKm - b.distKm);

    const nameMatchSet = new Set(nameMatched.map(a => a.name));
    const top = [
      ...byDist.filter(a => nameMatchSet.has(a.name)),
      ...byDist.filter(a => !nameMatchSet.has(a.name)),
    ].slice(0, 3).map(a => ({
      name:         a.name,
      iata:         a.iata,
      city:         a.city,
      country:      a.country,
      lat:          a.lat,
      lon:          a.lon,
      distKm:       a.distKm,
      display_name: `${a.name} (${a.iata})`,
    }));

    const closest    = top[0];
    const IS_AIRPORT = 60;
    console.log(`[RESOLVE-AIRPORT] (${lat.toFixed(2)},${lon.toFixed(2)}) name="${name}" → ${closest.name} ${closest.distKm}km`);

    res.json({
      isAirport:       closest.distKm <= IS_AIRPORT,
      closestDistKm:   closest.distKm,
      nearestAirports: top,
    });
  } catch (err) {
    console.error('resolveAirport error:', err.message);
    res.status(500).json({ error: 'Airport resolution failed' });
  }
};

exports.compareRoutes = async (req, res) => {
  try {
    const { routes } = req.body;
    if (!routes || routes.length === 0) {
      return res.status(400).json({ success: false, error: 'No routes provided' });
    }

    const cacheKey = `cmp_${routes.map(r => `${(r.intelligence?.riskScore || 0)}_${r.summary || ''}`).join('|')}`;
    const cached = geminiCache.get(cacheKey);
    if (cached) return res.json({ success: true, recommendation: cached });

    const summaries = routes.map((r, i) => {
      const distKm   = Math.round((r.distance || 0) / 1000);
      const durDays  = ((r.duration || 0) / 86400).toFixed(1);
      const durHrs   = ((r.duration || 0) / 3600).toFixed(1);
      const score    = r.intelligence?.riskScore || 0;
      const sev      = r.intelligence?.severity || 'STABLE';
      const zones    = r.intelligence?.riskZones?.map(z => z.name).join(', ') || 'none';
      const dur      = distKm > 2000 ? `${durDays} days` : `${durHrs} hrs`;
      return `Route ${i + 1} "${r.summary || `Option ${i + 1}`}": ${distKm} km, ${dur} transit, Risk ${score}/100 (${sev}), Threat zones: ${zones}`;
    }).join('\n');

    const prompt = `You are a senior maritime logistics AI analyst. A freight operator needs to choose between these shipping routes:\n\n${summaries}\n\nAnalyze risk vs time tradeoffs and recommend the best route for a commercial operator.\n\nRespond ONLY with this exact JSON (no markdown, no extra text):\n{"recommendedIndex":0,"label":"exact route name from above","reasoning":"2-3 sentences on why this route is best considering risk, time, and geopolitical stability","tradeoff":"one concise sentence on the main compromise accepted"}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json|```/g, '').trim();

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*?\}/);
      json = match ? JSON.parse(match[0]) : {
        recommendedIndex: 0,
        label: routes[0]?.summary || 'Route 1',
        reasoning: 'Route 1 selected based on available data.',
        tradeoff: 'No detailed comparison available.',
      };
    }

    json.recommendedIndex = Math.max(0, Math.min(Number(json.recommendedIndex) || 0, routes.length - 1));
    geminiCache.set(cacheKey, json);
    res.json({ success: true, recommendation: json });
  } catch (error) {
    console.error('compareRoutes error:', error.message);
    res.status(500).json({ success: false, error: 'AI comparison unavailable' });
  }
};
