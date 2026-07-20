const express = require('express');
const router = express.Router();
const dashboardService = require('../services/superAdminDashboardService');

/**
 * GET /api/v1/super-admin-dashboard
 *
 * Query Parameters (all optional):
 *   branch_id   – filter by branch
 *   period      – today | week | month | year | ytd
 *   from_date   – YYYY-MM-DD  (used when period is absent)
 *   to_date     – YYYY-MM-DD  (used when period is absent)
 */
router.get('/super-admin-dashboard', dashboardService.getSuperAdminDashboard);
router.get('/super-admin-dashboard/sales-kpi', dashboardService.getSalesSummary);
router.get('/super-admin-dashboard/profit-kpi', dashboardService.getProfitKPISummary);
router.get('/super-admin-dashboard/stock-kpi', dashboardService.getStockKpiSummary);
router.get('/super-admin-dashboard/profit-section', dashboardService.getProfitSection);

module.exports = router;
