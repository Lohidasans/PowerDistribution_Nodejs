const express = require("express");
const router = express.Router();
const service = require("../services/orderService");

router.get("/orders/generate-code", service.generateOrderCode);
router.post("/orders", service.createOrder);
router.get("/orders", service.getOrders);
router.get("/orders/:id", service.getOrderById);
router.delete("/orders/:id", service.deleteOrder);

module.exports = router;
