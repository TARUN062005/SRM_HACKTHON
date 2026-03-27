const mongoose = require('mongoose');

const riskLogSchema = new mongoose.Schema({
  routeId: { type: String, required: true },
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment' },
  factors: {
    weather: { type: Number, required: true },
    traffic: { type: Number, required: true },
    news: { type: Number, required: true }
  },
  finalScore: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RiskLog', riskLogSchema);
