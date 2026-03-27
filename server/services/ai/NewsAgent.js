class NewsAgent {
  async evaluateRisk(region) {
    try {
      // Mock logic for NewsAPI + NLP keywords (war, strike, protest)
      const mockRisk = Math.random();
      return {
        source: 'news',
        score: mockRisk,
        metadata: { keywordsDetected: mockRisk > 0.8 ? ['strike', 'protest'] : [] }
      };
    } catch (error) {
      console.error('NewsAgent Error:', error);
      return { source: 'news', score: 0.2, metadata: { error: 'Fallback used' } };
    }
  }
}

module.exports = new NewsAgent();
