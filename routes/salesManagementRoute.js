const express = require('express');
const router = express.Router();
const svc = require("../services/salesManagementService");

router.get("/sales-management/sales-report", svc.getSalesReport);
router.get("/sales-management/fast-moving-subcategories", svc.getFastMovingSubCategories);
router.get("/sales-management/fast-moving-sold-products", svc.getFastMovingSoldProducts);
router.get("/sales-management/top-buying-customers", svc.getTopBuyingCustomers);

module.exports = router;