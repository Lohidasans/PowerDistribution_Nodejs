const express = require("express");
const router = express.Router();
const svc = require("../services/purchaseOrderService");

// CRUD
router.post("/purchase-orders", svc.createPurchaseOrder);
router.get("/purchase-orders", svc.listPurchaseOrders);
router.get("/purchase-orders/dropdown", svc.listPurchaseOrderNumbers);
router.get("/purchase-orders/:id", svc.getPurchaseOrderById);
router.get("/purchase-orders/:id/view", svc.getPurchaseOrderView);
router.put("/purchase-orders/:id", svc.updatePurchaseOrder);
router.delete("/purchase-orders/:id", svc.deletePurchaseOrder);
router.post("/purchase-orders/code", svc.generatePoCode);

module.exports = router;


