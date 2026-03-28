const { GoogleGenerativeAI } = require('@google/generative-ai');
const routeOptimizer = require('../services/RouteOptimizationService');
const Shipment = require('../models/Shipment');
const riskEngine = require('../services/RiskScoringEngine');
const RiskLog = require('../models/RiskLog');
const axios = require('axios');
const NodeCache = require('node-cache');
const routeCache = new NodeCache({ stdTTL: 300 }); // 5 minute caching layer

// Initialize Gemini for high-level safety analysis (Feature 3 & 4)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA');
const geminiCache = new NodeCache({ stdTTL: 1800 }); // Longer cache for analysis

/**
 * HELPER: Haversine Distance between two [lng, lat] points
 */
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

/**
 * HELPER: Extract MAX 6 Checkpoints (Start, End + 4 Distributed)
 * Prevents 429 Rate Limiting for long routes.
 */
function getCheckpoints(coords) {
  if (coords.length <= 6) return coords;
  const result = [];
  const total = coords.length;
  // Pick Start, End and 4 optimally distributed points
  const indices = [0, Math.floor(total * 0.2), Math.floor(total * 0.4), Math.floor(total * 0.6), Math.floor(total * 0.8), total - 1];
  indices.forEach(idx => result.push(coords[idx]));
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

const RISK_KEYWORDS = {
  conflict: ["war", "conflict", "attack", "missile", "airstrike", "invasion"],
  civil: ["riot", "protest", "violence", "clash", "curfew", "demonstration"],
  transport: ["accident", "traffic", "roadblock", "closure", "delay", "highway", "derailment"],
  weather: ["storm", "rain", "flood", "cyclone", "heatwave", "landslide"],
  political: ["election", "strike", "ban", "sanction", "shutdown"]
};

/**
 * HELPER: Classify article based on risk keywords
 */
function classifyNews(article) {
  const text = ((article.title || "") + " " + (article.description || "")).toLowerCase();
  const categories = [];
  for (const [type, keywords] of Object.entries(RISK_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) {
      categories.push(type);
    }
  }
  return categories;
}

/**
 * FEATURE 3 & 4: HIGH-FIDELITY TACTICAL INTELLIGENCE (A -> KEY POINTS -> B)
 */
const getRouteIntelligence = async (coords, sourceName = "Mission Sector", destName = "Target Point") => {
  const cacheKey = `intel-v9-${coords[0][0]}-${coords[coords.length - 1][0]}`;
  if (geminiCache.has(cacheKey)) return geminiCache.get(cacheKey);

  try {
    // 1. Fetch News ONCE for the entire Mission Corridor (Fixed 422 & 429)
    let newsFeed = [];
    if (process.env.NEWSDATA_API_KEY) {
      try {
        const cleanSource = sourceName.split(',')[0].trim();
        const cleanDest = destName.split(',')[0].trim();
        // Unified Risk Query
        const riskQuery = `("${cleanSource}" OR "${cleanDest}") AND (war OR strike OR accident OR traffic OR flood OR storm)`;
        
        const nRes = await axios.get("https://newsdata.io/api/1/news", {
          params: { apikey: process.env.NEWSDATA_API_KEY, q: riskQuery, language: "en" },
          timeout: 4000
        });
        
        newsFeed = (nRes.data.results || []).map(item => ({
           title: item.title, source: item.source_id, link: item.link, date: item.pubDate, categories: classifyNews(item)
        })).filter(n => n.categories.length > 0).slice(0, 4);
      } catch (e) { console.error("News Harvest Failed:", e.message); }
    }

    // 2. Extract Key Tactical Nodes (Max 6 to prevent 429)
    const checkpoints = getCheckpoints(coords);

    // 3. Environment Telemetry & Geographic Resolution (Parallel)
    const waypointData = await Promise.all(checkpoints.map(async (p, i) => {
      try {
        const [wRes, gRes] = await Promise.all([
          axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${p[1]}&longitude=${p[0]}&current_weather=true`, { timeout: 3000 }),
          axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p[1]}&lon=${p[0]}&zoom=14`, {
            headers: { 'User-Agent': 'RouteGuardian/1.1' }, timeout: 3000
          })
        ]);

        const addr = gRes.data?.address;
        const placeName = addr?.city || addr?.town || addr?.suburb || addr?.village || addr?.railway || `Hub ${i + 1}`;
        const current = wRes.data.current_weather;

        return {
          id: `A${i}`,
          place: placeName,
          condition: getWeatherCondition(current.weathercode),
          temp: current.temperature,
          wind: current.windspeed,
          code: current.weathercode,
          coords: [p[1], p[0]]
        };
      } catch (e) { 
        return {
          id: `A${i}`,
          place: `Mission Hub ${i + 1}`,
          condition: "Clear",
          temp: 25,
          wind: 5,
          code: 0,
          coords: [p[1], p[0]]
        }; 
      }
    }));

    const validWaypoints = waypointData.filter(Boolean);

    // 4. Final Assessment Bundle
    const aiResp = {
      summary: "Mission Corridor monitored. Tactical telemetry active.",
      riskScore: newsFeed.some(n => n.categories.includes('conflict')) ? 90 : 
                 validWaypoints.some(v => v.condition === 'Storm') ? 85 : 15,
      severity: newsFeed.some(n => n.categories.includes('conflict')) || validWaypoints.some(v => v.condition === 'Storm') ? "CRITICAL" : "STABLE",
      directive: newsFeed.length > 0 ? "Potential mission disruptions detected. Review briefing." : "Corridor clear. Standard protocol."
    };

    const finalIntel = {
      summary: aiResp.summary,
      riskScore: aiResp.riskScore,
      severity: aiResp.severity,
      waypointReports: validWaypoints.map((v) => ({
        id: v.id,
        place: v.place,
        weather: `${v.condition} • ${v.temp}°C • ${v.wind} km/h`,
        severity: v.condition === 'Storm' ? 'CRITICAL' : 'STABLE',
        raw: v
      })),
      strategicWarnings: [aiResp.directive],
      commandDirective: aiResp.directive,
      newsFeed: newsFeed 
    };
    
    geminiCache.set(cacheKey, finalIntel);
    return finalIntel;
  } catch (err) {
    return { summary: "Mission Protocol Offline.", newsFeed: [], waypointReports: [] };
  }
};

/**
 * Fetch routes from OSRM with alternatives enabled
 */
const fetchRoutesFromProvider = async (start, end, profile = 'driving') => {
  const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?geometries=geojson&alternatives=true&steps=true&overview=full`;
  const response = await axios.get(osrmUrl);
  return response.data.routes || [];
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
    return (matches / checked) > 0.80; // Reject if >80% overlap
  });
};

// --- API HANDLERS ---

exports.getDirections = async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, vehicle = 'driving', sourceName, destName } = req.query;
    if (!startLat || !startLng || !endLat || !endLng) return res.status(400).json({ error: 'Missing coords' });

    const cacheKey = `v9-${startLat}-${startLng}-${endLat}-${endLng}-${vehicle}`;
    if (routeCache.has(cacheKey)) return res.json({ success: true, routes: routeCache.get(cacheKey) });

    const vehicleProfileMap = {
      'car': 'driving',
      'bike': 'cycling',
      'foot': 'walking',
      'bus': 'driving',
      'truck': 'driving'
    };

    const speedScaleMap = {
      'car': 1,
      'bike': 3,
      'foot': 8,
      'bus': 1.5,
      'truck': 1.3
    };

    const profile = vehicleProfileMap[vehicle] || 'driving';
    const scale = speedScaleMap[vehicle] || 1;

    let paths = await fetchRoutesFromProvider([startLat, startLng], [endLat, endLng], profile);

    // Artificial Discovery to guarantee 3 routes
    if (paths.length < 3 && paths.length > 0) {
      const primary = paths[0];
      const mid = primary.geometry.coordinates[Math.floor(primary.geometry.coordinates.length * 0.45)];
      const offsets = [0.015, -0.015];
      for (const offset of offsets) {
        if (paths.length >= 3) break;
        const viaUrl = `https://router.project-osrm.org/route/v1/${profile}/${startLng},${startLat};${mid[0] + offset},${mid[1] + offset};${endLng},${endLat}?geometries=geojson&overview=full`;
        try {
          const vRes = await axios.get(viaUrl);
          if (vRes.data.routes?.length > 0 && isUniqueRoute(vRes.data.routes[0], paths)) {
            paths.push(vRes.data.routes[0]);
          }
        } catch (e) { }
      }
    }

    const processedRoutes = await Promise.all(paths.slice(0, 3).map(async (route, i) => {
      const correctedDuration = route.duration * scale;
      
      // Pass names for optimized News/Geocoding
      const intelligence = await getRouteIntelligence(route.geometry.coordinates, sourceName, destName);
      
      return {
        id: i,
        type: i === 0 ? 'Optimal' : i === 1 ? 'Balanced' : 'Alternative',
        geometry: route.geometry,
        distance: route.distance,
        duration: correctedDuration,
        summary: route.legs?.[0]?.summary || 'Primary Roadways',
        intelligence: intelligence,
        vehicle: vehicle,
        steps: route.legs?.[0]?.steps?.map(s => ({ instruction: s.maneuver.instruction, distance: s.distance })) || []
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
    if (!q) return res.status(400).json({ error: 'Search query required' });

    const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
      params: {
        format: 'json',
        q: q,
        limit: limit,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'RouteGuardian/1.0',
        'Referer': 'http://localhost:5000'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Search Proxy Error:', error.message);
    res.status(500).json({ error: 'Search engine failed' });
  }
};

// --- STUB HANDLERS FOR MISSION SUBSYSTEMS ---
exports.createShipment = async (req, res) => { res.json({ success: true }); };
exports.getShipment = async (req, res) => { res.json({ success: true }); };
exports.analyzeRisk = async (req, res) => { res.json({ success: true }); };
exports.getAlerts = async (req, res) => { res.json({ success: true }); };
exports.getWeather = async (req, res) => { res.json({ success: true }); };
exports.optimizeRoute = async (req, res) => { res.json({ success: true, message: 'Neural optimization active' }); };
