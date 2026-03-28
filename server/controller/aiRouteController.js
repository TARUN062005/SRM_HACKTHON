const routeOptimizer = require('../services/RouteOptimizationService');
const Shipment = require('../models/Shipment');
const riskEngine = require('../services/RiskScoringEngine');
const RiskLog = require('../models/RiskLog');
const axios = require('axios');
const NodeCache = require('node-cache');
const routeCache = new NodeCache({ stdTTL: 300 }); // 5 minute caching layer

exports.optimizeRoute = async (req, res) => {
  try {
    const { source, destination } = req.body;
    if (!source || !destination) {
      return res.status(400).json({ error: 'Source and destination required.' });
    }

    const optimizationResult = await routeOptimizer.optimize(source, destination);
    res.json({ success: true, data: optimizationResult });
  } catch (error) {
    console.error('Route optimization error:', error);
    res.status(500).json({ error: 'Failed to optimize route.' });
  }
};

exports.getDirections = async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, vehicle = 'driving' } = req.query;

    if (!startLat || !startLng || !endLat || !endLng) {
      return res.status(400).json({ error: 'Missing coordinate parameters' });
    }

    const cacheKey = `v4-${startLat},${startLng}-${endLat},${endLng}-${vehicle}`;
    if (routeCache.has(cacheKey)) {
      return res.json({ success: true, routes: routeCache.get(cacheKey) });
    }

    let osrmProfile = 'driving';
    if (vehicle === 'bike') osrmProfile = 'cycling';
    else if (vehicle === 'foot' || vehicle === 'walk') osrmProfile = 'walking';

    // 1. Primary Request
    const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&alternatives=true&steps=true&overview=full`;
    const response = await axios.get(osrmUrl);
    
    let paths = response.data.routes || [];
    
    // 2. Artificial Discovery Fallback
    // If fewer than 3 alternatives, force structural variation via waypoints
    if (paths.length < 3 && paths.length > 0) {
      try {
        const primary = paths[0];
        const coords = primary.geometry.coordinates;
        const midPoint = coords[Math.floor(coords.length * 0.45)]; // Use mid-section
        
        const offsets = [-0.012, 0.012]; // ~1.2km offset
        for (const offset of offsets) {
          if (paths.length >= 3) break;
          const via = [midPoint[0] + offset, midPoint[1] + offset];
          const viaUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${startLng},${startLat};${via[0]},${via[1]};${endLng},${endLat}?geometries=geojson&overview=full`;
          const vRes = await axios.get(viaUrl);
          if (vRes.data.routes?.length > 0) {
            const candidate = vRes.data.routes[0];
            const isDup = paths.some(p => checkOverlap(candidate.geometry.coordinates, p.geometry.coordinates) > 0.80);
            if (!isDup) paths.push(candidate);
          }
        }
      } catch (err) { console.error("Discovery failed", err.message); }
    }

    const processedRoutes = paths.slice(0, 3).map((route, i) => ({
       id: i,
       type: i === 0 ? 'Optimal' : i === 1 ? 'Balanced' : 'Alternative',
       geometry: route.geometry,
       distance: route.distance,
       duration: route.duration,
       summary: route.legs?.[0]?.summary || 'Primary Road',
       steps: route.legs?.[0]?.steps?.map(s => ({
         instruction: s.maneuver.instruction,
         distance: s.distance
       })) || []
    }));

    routeCache.set(cacheKey, processedRoutes);
    res.json({ success: true, routes: processedRoutes });
  } catch (error) {
    console.error('Directions API error:', error.message);
    res.status(500).json({ error: 'Routing mapping failed downstream' });
  }
};

function checkOverlap(coords1, coords2) {
  if (!coords1 || !coords2) return 1;
  let matches = 0;
  const samples = Math.min(coords1.length, 20);
  const step = Math.max(1, Math.floor(coords1.length / samples));
  let count = 0;
  for (let i = 0; i < coords1.length; i += step) {
    count++;
    const p1 = coords1[i];
    const match = coords2.some(p2 => Math.abs(p1[0] - p2[0]) < 0.0005 && Math.abs(p1[1] - p2[1]) < 0.0005);
    if (match) matches++;
  }
  return matches / count;
}

exports.createShipment = async (req, res) => {
  try {
    const { source, destination } = req.body;
    const optimization = await routeOptimizer.optimize(source, destination);

    const shipment = new Shipment({
      source,
      destination,
      route: optimization.bestRoute,
      alternatives: optimization.alternatives,
      riskScore: optimization.globalRiskScore,
      status: 'PENDING'
    });

    await shipment.save();
    res.status(201).json({ success: true, data: shipment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create shipment.' });
  }
};

exports.getShipment = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    res.json({ success: true, data: shipment });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching shipment' });
  }
};

exports.analyzeRisk = async (req, res) => {
  try {
    const { routeData } = req.body;
    const analysis = await riskEngine.analyzeRisk(routeData || {});
    res.json({ success: true, data: analysis });
  } catch (error) {
    res.status(500).json({ error: 'Risk analysis failed.' });
  }
};

exports.getAlerts = async (req, res) => {
  try {
    const highRiskLogs = await RiskLog.find({ finalScore: { $gt: 0.75 } })
      .sort({ timestamp: -1 })
      .limit(20)
      .populate('shipmentId', 'source destination status');
      
    res.json({ success: true, data: highRiskLogs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch alerts.' });
  }
};

exports.getWeather = async (req, res) => {
    const { lat, lon } = req.query;

    try {
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Missing coordinates' });
        }
        
        // Use free Open-Meteo to simulate OpenWeatherMap
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code`;
        const response = await axios.get(url);
        
        const code = response.data.current.weather_code;
        let mainCondition = "Clear";
        
        if (code >= 51 && code <= 55) mainCondition = "Drizzle";
        else if (code >= 61 && code <= 65) mainCondition = "Rain";
        else if (code >= 95) mainCondition = "Thunderstorm";
        else if (code >= 71) mainCondition = "Snow";
        else if (code >= 1 && code <= 3) mainCondition = "Clouds";

        // MERN Style Exact Match Response
        res.json({
            weather: [ { main: mainCondition } ],
            coord: { lat: parseFloat(lat), lon: parseFloat(lon) },
            main: { temp: 20 } // mock temp
        });

    } catch (error) {
        console.error("Weather fetch failed", error.message);
        res.status(500).json({ error: "API error" });
    }
};
