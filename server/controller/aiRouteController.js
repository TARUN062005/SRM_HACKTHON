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

    const cacheKey = `${startLat},${startLng}-${endLat},${endLng}-${vehicle}`;
    if (routeCache.has(cacheKey)) {
      return res.json({ success: true, routes: routeCache.get(cacheKey) });
    }

    // Safely map generic logistcs modes to OSRM supported engine profiles publicly (driving, bike, foot)
    let osrmProfile = 'driving';
    if (vehicle === 'bike') osrmProfile = 'bike';
    else if (vehicle === 'foot' || vehicle === 'walk') osrmProfile = 'foot';
    else osrmProfile = 'driving'; // Default to driving geometry for Car, Truck, Bus

    // Rely on Project OSRM or existing router as the generic mapping engine ("or similar to GraphHopper")
    // Rely on Project OSRM or existing router as the generic mapping engine ("or similar to GraphHopper")
    const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&alternatives=3&steps=true`;
    const response = await axios.get(osrmUrl);
    
    let paths = response.data.routes;
    if (!paths || paths.length === 0) {
      return res.status(404).json({ error: 'No routes found' });
    }

    // 1. Dynamic Filter Thresholds (Distance/Time scaling based on total trip length)
    const primaryRoute = paths[0];
    const isLongDistance = primaryRoute.distance >= 50000; // 50km
    
    const distanceCapConst = isLongDistance ? 1.35 : 1.25;
    const timeCapConst = isLongDistance ? 1.25 : 1.20;

    const maxAllowedDistance = primaryRoute.distance * distanceCapConst;
    const maxAllowedTime = primaryRoute.duration * timeCapConst;

    // 2. Score and Filter Routes
    const processedRoutes = [];

    for (let i = 0; i < paths.length; i++) {
       const route = paths[i];

       // Calculate turn density (steps / distance in km)
       let stepCount = 0;
       if (route.legs && route.legs[0] && route.legs[0].steps) {
         stepCount = route.legs[0].steps.length;
       }
       // Pass stepCount back down via custom parameter for Frontend UI
       route.stepCount = stepCount; 
       
       const distanceKm = route.distance / 1000;
       const turnDensity = distanceKm > 0 ? (stepCount / distanceKm) : 0;
       
       // Reject ridiculous zig-zaging routes if they aren't the primary only viable route
       // Empirically tuned: discard heavily zigzagging routes.
       if (i !== 0 && turnDensity > 0.02) continue; 

       // A. Always keep PRIMARY route to avoid completely empty returns
       if (i !== 0) {
         // B. Reject macro structural detours (using dynamic consts)
         if (route.distance > maxAllowedDistance || route.duration > maxAllowedTime) continue;
         
         // C. Reject micro-variations (absolute diff checks)
         const timeDiffMin = Math.abs(route.duration - primaryRoute.duration) / 60;
         const distDiffPct = Math.abs(route.distance - primaryRoute.distance) / primaryRoute.distance;
         if (timeDiffMin < 2.0 && distDiffPct < 0.03) continue; // Too similar structurally

         const routeCoords = route.geometry.coordinates;

         // E. Remove Loop / Rejoin Routes 
         // Heuristic: If route diverges briefly then rejoins same road, the start and end segments typically precisely match the primary route
         const primaryCoords = primaryRoute.geometry.coordinates;
         if (routeCoords.length > 20 && primaryCoords.length > 20) {
            const startMatches = Math.abs(routeCoords[5][0] - primaryCoords[5][0]) < 0.0005 && Math.abs(routeCoords[5][1] - primaryCoords[5][1]) < 0.0005;
            const endIdx = routeCoords.length - 5;
            const pEndIdx = primaryCoords.length - 5;
            const endMatches = Math.abs(routeCoords[endIdx][0] - primaryCoords[pEndIdx][0]) < 0.0005 && Math.abs(routeCoords[endIdx][1] - primaryCoords[pEndIdx][1]) < 0.0005;
            if (startMatches && endMatches) continue; // Loop detour detected
         }

         // D. Advanced Geometry Overlap Checking (>= 80% overlap)
         // Sample every 10th coordinate to save exact node matching CPU cost
         if (routeCoords.length > 20) {
             const isDuplicateGeometry = processedRoutes.some(prev => {
                const prevCoords = prev.geometry.coordinates;
                let matches = 0;
                let sampleDrops = 0;
                
                // Compare down-sampled coords
                for (let k = 0; k < routeCoords.length; k += 10) {
                   sampleDrops++;
                   // Fast radial bounds check roughly ~50 meters
                   const p1 = routeCoords[k];
                   const collision = prevCoords.find(p2 => 
                      Math.abs(p1[0] - p2[0]) < 0.0005 && 
                      Math.abs(p1[1] - p2[1]) < 0.0005
                   );
                   if (collision) matches++;
                }
                const overlapPercentage = matches / sampleDrops;
                return overlapPercentage > 0.80; // 80% overlap = delete
             });
             
             if (isDuplicateGeometry) continue; // Failed exact overlap check
         }
       }

       // Calculate final normalized "Route Health Score" 
       // Lower SCORE = Better Route
       const normalizedTime = route.duration / primaryRoute.duration; // 1.0 for primary, >1 for alt
       const normalizedDist = route.distance / primaryRoute.distance; // 1.0 for primary, >1 for alt
       const normalizedDensity = Math.min(turnDensity / 0.5, 2.0); // Bound density impact
       
       route.healthScore = (normalizedTime * 0.6) + (normalizedDist * 0.2) + (normalizedDensity * 0.2);
       processedRoutes.push(route);
    }

    // 3. Sort by computed health score (lower is functionally better/smoother)
    processedRoutes.sort((a, b) => a.healthScore - b.healthScore);
    
    // 4. Maximum rendering caps to prevent map clutter and save VRAM limit
    const finalRoutes = processedRoutes.slice(0, 3);
    
    routeCache.set(cacheKey, finalRoutes);
    res.json({ success: true, routes: finalRoutes });
  } catch (error) {
    console.error('Directions API error:', error.message);
    res.status(500).json({ error: 'Routing mapping failed downstream' });
  }
};

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
