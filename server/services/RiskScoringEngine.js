const weatherAgent = require('./ai/WeatherAgent');
const trafficAgent = require('./ai/TrafficAgent');
const newsAgent = require('./ai/NewsAgent');
// Use the model if it exists, else handle failure gracefully
let RiskLog;
try {
  RiskLog = require('../models/RiskLog');
} catch (e) {
  RiskLog = null;
}

class RiskScoringEngine {
  constructor() {
    this.weights = {
      weather: process.env.WEIGHT_WEATHER || 0.4,
      traffic: process.env.WEIGHT_TRAFFIC || 0.3,
      news: process.env.WEIGHT_NEWS || 0.3
    };
  }

  async analyzeRisk(routeData, shipmentId = null) {
    const [weatherRes, trafficRes, newsRes] = await Promise.all([
      weatherAgent.evaluateRisk(routeData.coords || {}),
      trafficAgent.evaluateRisk(routeData.nodes || []),
      newsAgent.evaluateRisk(routeData.region || 'global')
    ]);

    const finalScore = 
      (weatherRes.score * this.weights.weather) +
      (trafficRes.score * this.weights.traffic) +
      (newsRes.score * this.weights.news);

    if (RiskLog) {
      const logEntry = new RiskLog({
        routeId: routeData.id || 'unknown',
        shipmentId,
        factors: {
          weather: weatherRes.score,
          traffic: trafficRes.score,
          news: newsRes.score
        },
        finalScore
      });
      // Non-blocking log save
      logEntry.save().catch(err => console.error('Failed to save risk log:', err));
    }

    return {
      finalScore,
      factors: { weather: weatherRes, traffic: trafficRes, news: newsRes }
    };
  }
}

module.exports = new RiskScoringEngine();
