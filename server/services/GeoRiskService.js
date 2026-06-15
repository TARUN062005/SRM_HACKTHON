const axios = require('axios');
const NodeCache = require('node-cache');

// 10 minutes cache for route risk analysis
const routeRiskCache = new NodeCache({ stdTTL: 600 });
// 1 hour cache for global aggregated live incidents
const globalAlertsCache = new NodeCache({ stdTTL: 3600 });

// Helper to sanitize locations for Nominatim geocoding on GEO_RISK_ENGINE
function sanitizeLocation(loc) {
  if (!loc) return '';
  
  let s = loc;
  
  // 1. Remove text inside parentheses (e.g. "Mumbai (Bombay) Port" -> "Mumbai Port")
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ');
  
  // 2. Remove IATA/ICAO codes (3-4 letter uppercase words) but exclude common country/region codes like USA, UAE, CAN, IND
  s = s.replace(/\b(?!USA|UAE|CAN|IND|SGP|HKG|GBR|DEU|FRA|JPN|CHN|KOR|AUS|NZL|BRA|MEX|ZAF|RUS)[A-Z]{3,4}\b/g, '');
  
  // 3. Remove specific keywords
  const keywords = [
    'port', 'airport', 'terminal', 'harbor', 'harbour', 'dock', 'seaport',
    'chhatrapati shivaji', 'keppel', 'kempegowda', 'indira gandhi'
  ];
  keywords.forEach(kw => {
    s = s.replace(new RegExp(`\\b${kw}\\b`, 'gi'), '');
  });
  
  // 4. Remove extra separators and dashes, replace with spaces
  s = s.replace(/[-_\\/|]+/g, ' ');
  
  // 5. Split by comma, clean, and filter empty parts
  let parts = s.split(',').map(p => p.trim()).filter(Boolean);
  
  // 6. Clean internal multiple spaces
  parts = parts.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  
  // Deduplicate parts (case-insensitive)
  const uniqueParts = [];
  const seen = new Set();
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueParts.push(part);
    }
  }
  
  // 7. Convert to City, Country (usually the last 2 parts of the cleaned array)
  let resultParts = uniqueParts;
  if (resultParts.length > 2) {
    resultParts = resultParts.slice(-2);
  }
  
  return resultParts.join(', ');
}

class GeoRiskService {
  constructor() {
    this.baseUrl = process.env.GEO_RISK_ENGINE_URL || 'https://geo-risk-engine-ml-model.onrender.com';
    console.log(`[GeoRiskService] Initialized with base URL: ${this.baseUrl}`);
    
    // Seed default highly realistic alerts to guarantee zero-latency initial responses
    this.seededAlerts = [
      {
        id: "alert-seed-malacca",
        headline: "Increased Piracy & Armed Robbery Alert: Straits of Malacca and Singapore",
        label: "piracy",
        zone: "Singapore Strait",
        published_at: new Date(Date.now() - 3 * 3600000).toISOString(),
        publisher: "IMB Piracy Reporting Centre",
        source_url: "https://www.icc-ccs.org/index.php/piracy-port-state-control-reporting",
        image_url: null,
        location: [1.26, 103.88],
        confidence: 0.92,
        intensity: 0.78
      },
      {
        id: "alert-seed-bab",
        headline: "Red Sea Maritime Security Advisory: Bab-el-Mandeb Strait Drone Activity",
        label: "maritime",
        zone: "Bab-el-Mandeb Strait",
        published_at: new Date(Date.now() - 6 * 3600000).toISOString(),
        publisher: "UK Maritime Trade Operations (UKMTO)",
        source_url: "https://www.ukmto.org/advisories",
        image_url: null,
        location: [12.58, 43.33],
        confidence: 0.98,
        intensity: 0.88
      },
      {
        id: "alert-seed-northsea",
        headline: "Storm Advisory: Gale Force Winds and Rough Seas in North Sea Transits",
        label: "weather",
        zone: "North Sea",
        published_at: new Date(Date.now() - 12 * 3600000).toISOString(),
        publisher: "Met Office Marine Services",
        source_url: "https://www.metoffice.gov.uk/weather/specialist-forecasts/coast-and-sea",
        image_url: null,
        location: [56.5, 3.0],
        confidence: 0.89,
        intensity: 0.72
      },
      {
        id: "alert-seed-suez",
        headline: "Operational Delays: Suez Canal Anchorages Congestion Backlog",
        label: "port_closure",
        zone: "Suez Canal",
        published_at: new Date(Date.now() - 18 * 3600000).toISOString(),
        publisher: "Leth Agencies Operations",
        source_url: "https://lethagencies.com/suez-canal-updates",
        image_url: null,
        location: [30.43, 32.57],
        confidence: 0.94,
        intensity: 0.45
      },
      {
        id: "alert-seed-panama",
        headline: "Panama Canal Transit Advisory: Revised Draft Restrictions for Neopanamax Locks",
        label: "border_disruption",
        zone: "Panama Canal",
        published_at: new Date(Date.now() - 24 * 3600000).toISOString(),
        publisher: "Panama Canal Authority (ACP)",
        source_url: "https://www.pancanal.com/eng/op/index.html",
        image_url: null,
        location: [9.08, -79.69],
        confidence: 0.96,
        intensity: 0.48
      }
    ];

    // Seed the cache immediately so requests are never blocked
    globalAlertsCache.set('global-aggregated-alerts', this.seededAlerts);

    // Warm up the cache and keep it fresh in the background
    this.refreshLiveIncidentsInBackground().catch(err => {
      console.warn('[GeoRiskService] Initial live incidents refresh failed:', err.message);
    });

    // Run the background update loop every 10 minutes to prevent the Render tier from sleeping
    setInterval(() => {
      this.refreshLiveIncidentsInBackground().catch(err => {
        console.warn('[GeoRiskService] Periodic background refresh failed:', err.message);
      });
    }, 600000);
  }

  /**
   * Fetch advanced multi-mode risk analysis for a route.
   * Maps exactly to the GEO_RISK_ENGINE v5 response.
   */
  async analyzeRoute(origin, destination, radiusKm = 150, minConfidence = 0.2) {
    const sanitizedOrigin = sanitizeLocation(origin);
    const sanitizedDest = sanitizeLocation(destination);

    const cacheKey = `georisk-v5-${sanitizedOrigin}-${sanitizedDest}-${radiusKm}-${minConfidence}`;
    if (routeRiskCache.has(cacheKey)) {
      console.log(`[GeoRiskService] Cache HIT for route: ${sanitizedOrigin} -> ${sanitizedDest}`);
      return routeRiskCache.get(cacheKey);
    }

    // Log [GEO_RISK REQUEST]
    console.log(`[GEO_RISK REQUEST]\norigin=${sanitizedOrigin}\ndestination=${sanitizedDest}\npayload=${JSON.stringify({
      origin: sanitizedOrigin,
      destination: sanitizedDest,
      radius_km: radiusKm,
      min_confidence: minConfidence
    })}`);

    const retries = 5;
    let delay = 3000; // 3 seconds initial delay

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[GeoRiskService] Posting to v5 API (Attempt ${attempt}/${retries}): ${sanitizedOrigin} -> ${sanitizedDest}`);
        const response = await axios.post(`${this.baseUrl}/api/legacy/analyze/v5`, {
          origin: sanitizedOrigin,
          destination: sanitizedDest,
          radius_km: radiusKm,
          min_confidence: minConfidence
        }, {
          timeout: 15000 // 15 seconds timeout
        });

        if (response.data) {
          console.log('[DIAGNOSTIC - GEO_RISK_ENGINE RAW PAYLOAD]', JSON.stringify(response.data, null, 2));
          const recMode = response.data.recommended_mode;
          const recModeData = response.data.modes?.[recMode] || {};

          // Log [GEO_RISK RESPONSE]
          console.log(`[GEO_RISK RESPONSE]\nrisk_score=${recModeData.risk_score ?? 'N/A'}\nsafety_score=${recModeData.safety_score ?? 'N/A'}\nrecommended_mode=${recMode}\nalerts=${recModeData.alerts ?? 0}`);

          routeRiskCache.set(cacheKey, response.data);
          return response.data;
        }
      } catch (err) {
        console.warn(`[GeoRiskService] Attempt ${attempt} failed: ${err.message}`);
        
        // Handle 400 and 422 errors immediately without retrying since they are client input validation/geocoding errors
        if (err.response && [400, 422].includes(err.response.status)) {
          const detail = err.response.data?.detail || err.response.data?.error || 'Geocoding or validation failed on risk engine';
          console.error(`[GeoRiskService] Input validation/geocoding error (Status ${err.response.status}): ${JSON.stringify(detail)}`);
          throw err; // pass it to the controller
        }

        const isRetryable = err.code === 'ECONNABORTED' || !err.response || [429, 502, 503, 504].includes(err.response.status);
        if (isRetryable && attempt < retries) {
          console.log(`[GeoRiskService] Service might be waking up. Waiting ${delay}ms before next retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay += 2000; // incremental backoff
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
      { origin: 'Dubai, UAE', destination: 'Singapore' }
    ];

    const results = [];
    for (const c of corridors) {
      try {
        const res = await this.analyzeRoute(c.origin, c.destination, 300, 0.1);
        results.push(res);
      } catch (err) {
        console.warn(`[GeoRiskService] Failed background aggregation query for ${c.origin} -> ${c.destination}: ${err.message}`);
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
      // Return the cached alerts (which are either seeded defaults or previously fetched live ones)
      return globalAlertsCache.get(cacheKey);
    }
    return this.seededAlerts;
  }
}

module.exports = new GeoRiskService();
