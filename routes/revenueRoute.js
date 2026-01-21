var express = require("express");
var roleRouter = express.Router();
const svc = require("../services/revenueService");

roleRouter.get("/revenue/branch-wise-report", svc.getBranchwiseRevenue);
roleRouter.get("/revenue/branch-revenue-details", svc.getBranchRevenueDetails);


module.exports = roleRouter;