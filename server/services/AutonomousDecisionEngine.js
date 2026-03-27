let shipmentModel;
try {
  shipmentModel = require('../models/Shipment');
} catch(e) { /* fallback if model not loaded */ }

const routeOptimizer = require('./RouteOptimizationService');
const riskEngine = require('./RiskScoringEngine');

class AutonomousDecisionEngine {
  constructor() {
    this.RISK_THRESHOLD = 0.75;
    this.cooldowns = new Map();
    this.COOLDOWN_MS = 15 * 60 * 1000; // 15 mins
  }

  async evaluateShipments() {
    if (!shipmentModel) return;
    const activeShipments = await shipmentModel.find({ status: 'IN_TRANSIT' });

    for (let shipment of activeShipments) {
      if (this.isOnCooldown(shipment._id)) continue;

      try {
        const risk = await riskEngine.analyzeRisk({ id: shipment.route?.path?.join('-') }, shipment._id);
        
        if (risk.finalScore > this.RISK_THRESHOLD) {
          await this.triggerReroute(shipment, risk.finalScore);
        }
      } catch (err) {
        console.error(`Error evaluating shipment ${shipment._id}:`, err);
      }
    }
  }

  isOnCooldown(shipmentId) {
    const lastReroute = this.cooldowns.get(shipmentId.toString());
    if (!lastReroute) return false;
    return (Date.now() - lastReroute) < this.COOLDOWN_MS;
  }

  async triggerReroute(shipment, score) {
    console.log(`[REROUTE] Shipment ${shipment._id} exceeded risk threshold (${score})`);
    
    const optimization = await routeOptimizer.optimize(shipment.source, shipment.destination);
    
    shipment.route = optimization.bestRoute;
    shipment.alternatives = optimization.alternatives;
    shipment.riskScore = optimization.globalRiskScore;
    shipment.status = 'REROUTED';
    
    await shipment.save();
    this.cooldowns.set(shipment._id.toString(), Date.now());
  }
}

module.exports = new AutonomousDecisionEngine();
