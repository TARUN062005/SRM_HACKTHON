const graphEngine = require('./GraphRoutingEngine');
const riskEngine = require('./RiskScoringEngine');

class RouteOptimizationService {
  async optimize(source, destination) {
    // 1. Initial risk assessment to get weights (mocking globally for now)
    const riskAnalysis = await riskEngine.analyzeRisk({ region: 'global' });
    
    // Assume high risk penalizes certain nodes
    const nodeRisks = {
      'B': riskAnalysis.finalScore > 0.5 ? 2.0 : 0,
      'C': riskAnalysis.factors.weather.score > 0.7 ? 1.5 : 0
    };

    // 2. Compute best path using adjusted weights
    const bestRoute = graphEngine.calculateShortestPath(source, destination, nodeRisks);
    const alternatives = graphEngine.getAlternativePaths(source, destination, bestRoute);

    return {
      bestRoute: {
        path: bestRoute.path,
        totalCost: bestRoute.cost
      },
      alternatives: alternatives,
      globalRiskScore: riskAnalysis.finalScore,
      riskDrivers: riskAnalysis.factors
    };
  }
}

module.exports = new RouteOptimizationService();
