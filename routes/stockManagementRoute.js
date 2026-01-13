var express = require("express");
var router = express.Router();
const svc = require("../services/stockManagementService");

// CRUD
router.get("/stock-management/old-jewel-report", svc.getOldJewelReport);
router.get("/stock-management/stock-ageing-report", svc.getStockAgeingReport);
router.get("/stock-management/stock-in-hand-report", svc.getAllStockDetails);
module.exports = router;