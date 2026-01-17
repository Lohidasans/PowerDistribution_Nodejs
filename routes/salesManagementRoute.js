const express = require('express');
const router = express.Router();
const svc = require("../services/salesManagementService");

router.get("/sales-management/sales-report", svc.getSalesReport);

module.exports = router;