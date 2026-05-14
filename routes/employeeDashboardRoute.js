var express = require("express");
var router = express.Router();
const employeeDashboardService = require("../services/employeeDashboardService");

router.get("/employee-dashboard/sales-month-wise", employeeDashboardService.getEmployeeWiseSalesReport);
router.get("/employee-dashboard/stats", employeeDashboardService.getEmployeeDashboardStats);
router.get("/employee-dashboard/working-hours", employeeDashboardService.getWorkingHours);
router.get("/employee-dashboard/out-of-office-alerts", employeeDashboardService.getOutOfOfficeAlerts);


module.exports = router;