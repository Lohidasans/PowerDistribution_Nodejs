var express = require("express");
var router = express.Router();
const branchDashboardService = require("../services/branchDashboardService");

router.get("/branch-dashboard/score-card", branchDashboardService.getDashboardScorecards);
router.get("/branch-dashboard/top-metrics", branchDashboardService.getTopPerformanceDashboard);
router.get("/branch-dashboard/low-stock", branchDashboardService.getBranchDashboardLowStock);


module.exports = router;