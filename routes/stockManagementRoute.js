var express = require("express");
var router = express.Router();
const svc = require("../services/stockManagementService");

// CRUD
router.get("/stock-management/old-jewel-report", svc.getOldJewelReport);
router.get("/stock-management/stock-ageing-report", svc.getStockAgeingReport);

// just to check  - below 3 APIs are not in use
router.get("/stock-management/stock-in-hand-report", svc.getAllStockDetails);
router.get("/stock-management/low-stock-report", svc.getLowStockSummary);
router.get("/stock-management/out-of-stock-report", svc.getOutOfStockSummary);

// stock
router.get("/stock-management/stock-dashboard", svc.getStockDashboard);

// dashboard
router.get("/stock-management/dashboard/branch-stock", svc.getBranchStockSummary);
router.get("/stock-management/dashboard/branch-category-stock", svc.getBranchCategoryStock);
router.get("/stock-management/dashboard/vendor-contribution", svc.getVendorContributionReport);
router.get("/stock-management/dashboard/stock-by-material-type", svc.getStockByMaterialTypeReport);
router.get("/stock-management/dashboard/branchwise-stock-count", svc.getBranchwiseStockCount);
router.get("/stock-management/dashboard/grn-discrepancy-report", svc.getGrnDiscrepancyList);
router.get("/stock-management/dashboard/stock-overview-count", svc.getStockOverviewCount);

module.exports = router;