const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema({
  source: { type: String, required: true },
  destination: { type: String, required: true },
  route: {
    path: [String],
    distance: Number,
    baseCost: Number,
  },
  alternatives: [{
    path: [String],
    distance: Number,
  }],
  riskScore: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['PENDING', 'IN_TRANSIT', 'REROUTED', 'DELIVERED'], 
    default: 'PENDING' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Shipment', shipmentSchema);
