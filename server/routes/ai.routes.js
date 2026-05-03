const express = require('express');
const router = express.Router();
const aiRouteController = require('../controller/aiRouteController');

const aiAgentController = require('../controller/aiAgentController');

router.post('/route/optimize', aiRouteController.optimizeRoute);
router.post('/intent', aiAgentController.processAIIntent);
router.post('/agent/chat', aiAgentController.agentChat);
router.get('/directions', aiRouteController.getDirections);
router.post('/risk/analyze', aiRouteController.analyzeRisk);
router.post('/shipment', aiRouteController.createShipment);
router.get('/shipment/:id', aiRouteController.getShipment);
router.get('/alerts', aiRouteController.getAlerts);
router.get('/weather', aiRouteController.getWeather);
router.get('/search', aiRouteController.searchLocation);
router.post('/routes/compare', aiRouteController.compareRoutes);

module.exports = router;
