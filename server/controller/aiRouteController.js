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
 * HELPER: Extract Checkpoints every 35km
 */
function getCheckpoints(coords) {
  if (coords.length < 2) return coords;
  const result = [coords[0]];
  let lastPoint = coords[0];
  let accumulatedDist = 0;
  const INTERVAL = 35000; // 35km

  for (let i = 1; i < coords.length; i++) {
    const d = getDistance(lastPoint, coords[i]);
    accumulatedDist += d;
    lastPoint = coords[i];

    if (accumulatedDist >= INTERVAL) {
      result.push(coords[i]);
      accumulatedDist = 0;
    }
  }

  // Ensure target is always there and not too close to the last checkpoint
  const lastRes = result[result.length - 1];
  const target = coords[coords.length - 1];
  if (getDistance(lastRes, target) > 5000) {
    result.push(target);
  } else {
    result[result.length - 1] = target; // Replace last with exact target
  }

  return result;
}

/**
 * HELPER: Convert Code to Human Readable
 */
function getWeatherCondition(code, precipitation) {
  if (code === 95) return "Storm";
  if (code >= 71 && code <= 75) return "Snow";
  if (precipitation > 10) return "Heavy Rain";
  if (precipitation > 5) return "Moderate Rain";
  if (precipitation > 0) return "Light Rain";
  return "Clear";
}

/**
 * FEATURE 3 & 4: HIGH-FIDELITY TACTICAL INTELLIGENCE (A -> CHECKPOINTS -> B)
 */
const getRouteIntelligence = async (coords) => {
  const cacheKey = `intel-v6-${coords[0][0]}-${coords[coords.length - 1][0]}`;
  if (geminiCache.has(cacheKey)) return geminiCache.get(cacheKey);

  try {
    // 1. Extract 5 Key Checkpoints (Step 1)
    const checkpoints = getCheckpoints(coords);

    // 2. Fetch Raw Weather Data + Location Names (Parallel)
    const waypointData = await Promise.all(checkpoints.map(async (p, i) => {
      try {
        const [wRes, gRes] = await Promise.all([
          axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${p[1]}&longitude=${p[0]}&hourly=temperature_2m,precipitation,windspeed_10m,weathercode`),
          axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p[1]}&lon=${p[0]}&zoom=14`, {
            headers: { 'User-Agent': 'RouteGuardian/1.0' }
          })
        ]);
        
        const current = wRes.data.hourly;
        const temp = current.temperature_2m[0];
        const rain = current.precipitation[0];
        const wind = current.windspeed_10m[0];
        const code = current.weathercode[0];
        const condition = getWeatherCondition(code, rain);
        
        const addr = gRes.data?.address;
        const placeName = addr?.railway || addr?.suburb || addr?.town || addr?.city || `Waypoint ${i + 1}`;

        return {
          id: `A${i}`,
          place: placeName,
          condition,
          temp,
          wind,
          rain,
          coords: [p[1], p[0]]
        };
      } catch (e) { return null; }
    }));

    const validWaypoints = waypointData.filter(Boolean);

    // 3. Gemini Synthesis: Geopolitical Context
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `ACT AS A TACTICAL LOGISTICS ANALYST.
    Analyze these checkpoints for geopolitical risks (meetings, strikes, conflicts).
    SITES: ${validWaypoints.map(v => v.place).join(', ')}
    
    Return JSON only:
    {
      "summary": "Readout",
      "riskScore": 50,
      "severity": "STABLE",
      "waypointBriefs": [
        { "place": "Name", "intel": "Geopolitical report" }
      ],
      "directive": "Command"
    }`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const aiResp = JSON.parse(text);

    // 4. Build Final waypointReports (Step 4 & 5)
    const waypointReports = validWaypoints.map((v, idx) => ({
      id: v.id,
      place: v.place,
      weather: `${v.condition} • ${v.temp}°C • ${v.wind} km/h`,
      geopoliticalEffect: aiResp.waypointBriefs?.[idx]?.intel || `Precipitation: ${v.rain}mm • Wind: ${v.wind}km/h`,
      severity: v.condition === 'Storm' || v.condition === 'Heavy Rain' ? 'CRITICAL' : v.condition.includes('Rain') || v.condition === 'Snow' ? 'CAUTION' : 'STABLE',
      raw: v
    }));

    const finalIntel = {
      summary: aiResp.summary,
      riskScore: aiResp.riskScore,
      severity: aiResp.severity,
      waypointReports: waypointReports,
      strategicWarnings: [aiResp.directive],
      commandDirective: aiResp.directive
    };
    
    geminiCache.set(cacheKey, finalIntel);
    return finalIntel;
  } catch (err) {
    console.error("Tactical Intelligence Failed:", err.message);
    return { summary: "Standard travel protocol active.", riskScore: 10, severity: "STABLE", waypointReports: [], strategicWarnings: [], commandDirective: "Proceed." };
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
    const { startLat, startLng, endLat, endLng, vehicle = 'driving' } = req.query;
    if (!startLat || !startLng || !endLat || !endLng) return res.status(400).json({ error: 'Missing coords' });

    const cacheKey = `v6-${startLat}-${startLng}-${endLat}-${endLng}-${vehicle}`;
    if (routeCache.has(cacheKey)) return res.json({ success: true, routes: routeCache.get(cacheKey) });

    let profile = 'driving';
    if (vehicle === 'bike') profile = 'cycling';
    else if (vehicle === 'foot') profile = 'walking';

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

    const processedRoutes = await Promise.all(paths.slice(0, 3).map(async (route, i) => ({
      id: i,
      type: i === 0 ? 'Optimal' : i === 1 ? 'Balanced' : 'Alternative',
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      summary: route.legs?.[0]?.summary || 'Primary Roadways',
      intelligence: i === 0 ? await getRouteIntelligence(route.geometry.coordinates) : null,
      steps: route.legs?.[0]?.steps?.map(s => ({ instruction: s.maneuver.instruction, distance: s.distance })) || []
    })));

    routeCache.set(cacheKey, processedRoutes);
    res.json({ success: true, routes: processedRoutes });
  } catch (error) {
    console.error('Directions API error:', error.message);
    res.status(500).json({ error: 'Routing engine failed' });
  }
};

exports.createShipment = async (req, res) => { res.json({ success: true }); };
exports.getShipment = async (req, res) => { res.json({ success: true }); };
exports.analyzeRisk = async (req, res) => { res.json({ success: true }); };
exports.getAlerts = async (req, res) => { res.json({ success: true }); };
exports.getWeather = async (req, res) => { res.json({ success: true }); };
exports.optimizeRoute = async (req, res) => { res.json({ success: true }); };
