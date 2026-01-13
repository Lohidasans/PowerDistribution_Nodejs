var express = require("express");
var router = express.Router();
const svc = require("../services/stockManagementService");

// CRUD
router.get("/stock-management/old-jewel-report", svc.getOldJewelReport);
module.exports = router;