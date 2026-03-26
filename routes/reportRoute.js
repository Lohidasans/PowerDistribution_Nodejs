var express = require("express");
var router = express.Router();
const svc = require("../services/reportService");

router.get("/report/sales-invoice", svc.getSalesInvoiceReport);
router.get("/report/sales-return", svc.getSalesReturnReport);
router.get("/report/old-jewel", svc.getOldJewelReport);
router.get("/report/jewel-repair", svc.getJewelRepairReport);
router.get("/report/purchase", svc.getPurchaseReport);
router.get("/report/product-wise", svc.getProductWiseReport);
router.get("/report/ledger", svc.getVendorLedgerReport);

module.exports = router;