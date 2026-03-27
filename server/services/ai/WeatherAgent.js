const axios = require('axios');

class WeatherAgent {
  async evaluateRisk(locationCoords) {
    try {
      // Mock logic in place of actual API call:
      const mockSeverity = Math.random(); 
      return {
        source: 'weather',
        score: mockSeverity,
        metadata: { condition: mockSeverity > 0.7 ? 'Storm' : 'Clear' }
      };
    } catch (error) {
      console.error('WeatherAgent Error:', error);
      return { source: 'weather', score: 0.5, metadata: { error: 'Fallback used' } };
    }
  }
}

module.exports = new WeatherAgent();
