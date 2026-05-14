const express = require('express');
const router = express.Router();
const svc = require('../services/abandonedCheckoutService');

// Customer side — log an abandoned event
router.post('/abandoned-checkout', svc.logAbandonedEvent);

// Admin side — get stats (Total / Not Contacted / Contacted)
router.get('/abandoned-checkout/stats', svc.getAbandonedStats);

// Admin side — list all records with filters + pagination
router.get('/abandoned-checkout', svc.getAbandonedList);

// Admin side — update status / response / remarks
router.put('/abandoned-checkout/:id', svc.updateAbandonedStatus);

module.exports = router;
