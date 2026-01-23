const express = require('express');
const router = express.Router();
const svc = require("../services/salesManagementService");

router.get("/sales-management/sales-report", svc.getSalesReport);
router.get("/sales-management/fast-moving-subcategories", svc.getFastMovingSubCategories);
router.get("/sales-management/fast-moving-sold-products", svc.getFastMovingSoldProducts);
router.get("/sales-management/top-buying-customers", svc.getTopBuyingCustomers);

// Dashboard: Branch Wise Sales Count
router.get("/sales-management/dashboard/branch-wise-sales-count", svc.getBranchWiseSalesCount);
router.get("/sales-management/dashboard/branchwise-sales-and-customer-stats", svc.getBranchwiseSalesAndCustomerStats);
router.get("/sales-management/dashboard/sales-by-material-type", svc.getSalesByMaterialType);

module.exports = router;