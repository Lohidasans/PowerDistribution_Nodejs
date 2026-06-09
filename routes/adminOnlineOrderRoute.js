const express = require('express');
const router = express.Router();
const svc = require('../services/adminOnlineOrderService');

router.get('/admin/online-orders', svc.getOnlineOrders);
router.get('/admin/online-orders/:order_id', svc.getOnlineOrderDetails);
router.get('/admin/online-orders/:order_id/generate-invoice', svc.generateOnlineOrderInvoice);
router.get('/admin/online-orders/:order_id/invoice', svc.getOnlineOrderInvoice);
router.put('/admin/orders/update-shipment/:order_item_id', svc.updateShipmentDetails);
router.put('/admin/orders/update-delivery/:order_item_id', svc.updateDeliveredDetails);
router.put('/admin/online-orders/:order_id', svc.cancelOrder);

module.exports = router;