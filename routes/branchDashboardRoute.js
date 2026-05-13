var express = require("express");
var router = express.Router();
const branchDashboardService = require("../services/branchDashboardService");

router.get("/branch-dashboard/score-card", branchDashboardService.getDashboardScorecards);


module.exports = router;