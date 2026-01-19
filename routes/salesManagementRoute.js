const express = require('express');
const router = express.Router();
const svc = require("../services/salesManagementService");

router.get("/sales-management/sales-report", svc.getSalesReport);
router.get("/sales-management/fast-moving-subcategories", svc.getFastMovingSubCategories);

module.exports = router;