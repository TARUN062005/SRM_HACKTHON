const routeOptimizer = require('../services/RouteOptimizationService');
const Shipment = require('../models/Shipment');
const riskEngine = require('../services/RiskScoringEngine');
const RiskLog = require('../models/RiskLog');

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
