const express = require('express');
const router = express.Router();
const aiRouteController = require('../controller/aiRouteController');
const aiAgentController = require('../controller/aiAgentController');
const { verifyToken } = require('../middleware/authmiddleware');

router.use(verifyToken);

router.post('/warmup', aiRouteController.warmup);
router.post('/route/optimize', aiRouteController.optimizeRoute);
router.post('/intent', aiAgentController.processAIIntent);
router.post('/agent/chat', aiAgentController.agentChat);
router.get('/agent/state', aiAgentController.getAgentState);
router.post('/agent/state', aiAgentController.saveAgentState);
router.get('/directions', aiRouteController.getDirections);
router.post('/risk/analyze', aiRouteController.analyzeRisk);
router.post('/shipment', aiRouteController.createShipment);
router.get('/shipments', aiRouteController.getShipments);
router.delete('/shipments', aiRouteController.clearShipments);
router.delete('/shipment/:id', aiRouteController.deleteShipment);
router.get('/shipment/:id', aiRouteController.getShipment);
router.get('/alerts', aiRouteController.getAlerts);
router.get('/article-content', aiRouteController.getArticleContent);
router.get('/weather', aiRouteController.getWeather);
router.get('/search', aiRouteController.searchLocation);
router.get('/resolve-port', aiRouteController.resolvePort);
router.get('/resolve-airport', aiRouteController.resolveAirport);
router.post('/routes/compare', aiRouteController.compareRoutes);

module.exports = router;
