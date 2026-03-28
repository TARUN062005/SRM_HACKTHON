const express = require('express');
const router = express.Router();
const aiRouteController = require('../controller/aiRouteController');

router.post('/route/optimize', aiRouteController.optimizeRoute);
router.get('/directions', aiRouteController.getDirections);
router.post('/risk/analyze', aiRouteController.analyzeRisk);
router.post('/shipment', aiRouteController.createShipment);
router.get('/shipment/:id', aiRouteController.getShipment);
router.get('/alerts', aiRouteController.getAlerts);
router.get('/weather', aiRouteController.getWeather);
router.get('/search', aiRouteController.searchLocation);

module.exports = router;
