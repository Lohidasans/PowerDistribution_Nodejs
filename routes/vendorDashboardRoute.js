var express = require("express");
var router = express.Router();
const vendorDashboardService = require("../services/vendorDashboardService");

router.get("/vendor-dashboard/revenue-statistics", vendorDashboardService.getVendorRevenueStatistics);
router.get("/vendor-dashboard/quotation-summary", vendorDashboardService.getQuotationDashboard);


module.exports = router;