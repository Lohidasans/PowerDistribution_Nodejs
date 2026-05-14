var express = require("express");
var router = express.Router();
const employeeDashboardService = require("../services/employeeDashboardService");

router.get("/employee-dashboard/sales-month-wise", employeeDashboardService.getEmployeeWiseSalesReport);
router.get("/employee-dashboard/stats", employeeDashboardService.getEmployeeDashboardStats);


module.exports = router;