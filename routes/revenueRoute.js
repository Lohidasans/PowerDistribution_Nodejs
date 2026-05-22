var express = require("express");
var roleRouter = express.Router();
const svc = require("../services/revenueService");

roleRouter.get("/revenue/branch-wise-report", svc.getBranchwiseRevenue);
roleRouter.get("/revenue/branch-revenue-details", svc.getBranchRevenueDetailsNew);
roleRouter.get("/revenue/vendor-grn-list", svc.getVendorGrnRevenueList);
roleRouter.get("/revenue/vendor/grns/:grnId/view", svc.getVendorGrnView);


module.exports = roleRouter;