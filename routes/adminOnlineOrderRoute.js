const express = require('express');
const router = express.Router();
const svc = require('../services/adminOnlineOrderService');

router.get('/admin/online-orders', svc.getOnlineOrders);

module.exports = router;