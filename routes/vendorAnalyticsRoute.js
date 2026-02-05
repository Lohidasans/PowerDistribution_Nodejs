var express = require("express");
var vendorAnalyticsRouter = express.Router();
const vendorAnalyticsService = require("../services/vendorAnalyticsService");

// Comprehensive dashboard endpoint (all metrics in one response)
vendorAnalyticsRouter.get(
    "/vendor-analytics/dashboard",
    vendorAnalyticsService.getVendorDashboard
);

// Individual analytics endpoints
vendorAnalyticsRouter.get(
    "/vendor-analytics/total-vendors",
    vendorAnalyticsService.getTotalVendorCount
);
vendorAnalyticsRouter.get(
    "/vendor-analytics/active-vendors",
    vendorAnalyticsService.getActiveVendorCount
);
vendorAnalyticsRouter.get(
    "/vendor-analytics/outstanding-payables",
    vendorAnalyticsService.getOutstandingPayables
);
vendorAnalyticsRouter.get(
    "/vendor-analytics/sales-contribution",
    vendorAnalyticsService.getVendorSalesContribution
);
vendorAnalyticsRouter.get(
    "/vendor-analytics/purchase-by-material",
    vendorAnalyticsService.getPurchaseByMaterialType
);
vendorAnalyticsRouter.get(
    "/vendor-analytics/top-buying-categories",
    vendorAnalyticsService.getTopBuyingCategories
);
vendorAnalyticsRouter.get(
    "/vendor-analytics/transaction-history",
    vendorAnalyticsService.getTransactionHistory
);

module.exports = vendorAnalyticsRouter;

/**
 * @openapi
 * tags:
 *   - name: Vendor Analytics
 *     description: Vendor analytics and dashboard metrics
 */

/**
 * @openapi
 * /api/v1/vendor-analytics/dashboard:
 *   get:
 *     summary: Get comprehensive vendor dashboard
 *     description: Returns all vendor analytics metrics in a single response with optional filters
 *     tags: [Vendor Analytics]
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: integer
 *         description: Filter by branch ID (vendors must have this branch in their visibilities)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter GRNs from this date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter GRNs until this date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     filters:
 *                       type: object
 *                       properties:
 *                         branch_id:
 *                           type: integer
 *                           nullable: true
 *                         start_date:
 *                           type: string
 *                           nullable: true
 *                         end_date:
 *                           type: string
 *                           nullable: true
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         total_vendors:
 *                           type: integer
 *                           example: 45
 *                         active_vendors:
 *                           type: integer
 *                           example: 32
 *                         outstanding_payables:
 *                           type: object
 *                           properties:
 *                             amount:
 *                               type: string
 *                               example: "125525.00"
 *                             total_grn_amount:
 *                               type: string
 *                               example: "500000.00"
 *                             total_payments:
 *                               type: string
 *                               example: "374475.00"
 *                     vendor_sales_contribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           vendor_name:
 *                             type: string
 *                           vendor_code:
 *                             type: string
 *                           vendor_image_url:
 *                             type: string
 *                           gold:
 *                             type: string
 *                             example: "152.25 g"
 *                           silver:
 *                             type: string
 *                             example: "152.25 g"
 *                           total_value:
 *                             type: string
 *                     purchase_by_material:
 *                       type: object
 *                       properties:
 *                         materials:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               material_type:
 *                                 type: string
 *                               total_weight:
 *                                 type: string
 *                               item_count:
 *                                 type: integer
 *                               percentage:
 *                                 type: string
 *                         total_weight:
 *                           type: string
 */

/**
 * @openapi
 * /api/v1/vendor-analytics/total-vendors:
 *   get:
 *     summary: Get total vendor count
 *     description: Returns the total count of all vendors (excluding soft-deleted)
 *     tags: [Vendor Analytics]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_vendors:
 *                       type: integer
 *                       example: 45
 */

/**
 * @openapi
 * /api/v1/vendor-analytics/active-vendors:
 *   get:
 *     summary: Get active vendor count
 *     description: Returns the count of vendors with status = 'Active'
 *     tags: [Vendor Analytics]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     active_vendors:
 *                       type: integer
 *                       example: 32
 */

/**
 * @openapi
 * /api/v1/vendor-analytics/outstanding-payables:
 *   get:
 *     summary: Get outstanding payables
 *     description: Calculates total GRN amount minus total vendor payments
 *     tags: [Vendor Analytics]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     outstanding_payables:
 *                       type: string
 *                       example: "125525.00"
 *                     total_grn_amount:
 *                       type: string
 *                       example: "500000.00"
 *                     total_payments:
 *                       type: string
 *                       example: "374475.00"
 */

/**
 * @openapi
 * /api/v1/vendor-analytics/sales-contribution:
 *   get:
 *     summary: Get vendor sales contribution
 *     description: Returns purchase value per vendor with Gold and Silver weight breakdown for table visualization
 *     tags: [Vendor Analytics]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     vendors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           vendor_name:
 *                             type: string
 *                             example: "Golden Hub Pvt., Ltd."
 *                           vendor_code:
 *                             type: string
 *                             example: "VEN/01/24-25"
 *                           vendor_image_url:
 *                             type: string
 *                             example: "https://example.com/logo.png"
 *                           gold:
 *                             type: string
 *                             example: "152.25 g"
 *                           silver:
 *                             type: string
 *                             example: "152.25 g"
 *                           total_value:
 *                             type: string
 *                             example: "585585.00"
 */

/**
 * @openapi
 * /api/v1/vendor-analytics/purchase-by-material:
 *   get:
 *     summary: Get purchase by material type
 *     description: Returns purchase distribution by material type (weight-based) for pie chart
 *     tags: [Vendor Analytics]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     materials:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           material_type:
 *                             type: string
 *                             example: "Gold"
 *                           total_weight:
 *                             type: string
 *                             example: "5000.00"
 *                           item_count:
 *                             type: integer
 *                             example: 150
 *                           percentage:
 *                             type: string
 *                             example: "70.00"
 *                     total_weight:
 *                       type: string
 *                       example: "7142.86"
 */

/**
 * @openapi
 * /api/v1/vendor-analytics/top-buying-categories:
 *   get:
 *     summary: Get top buying categories
 *     description: Returns top 10 categories by purchase volume (item count) for bar chart
 *     tags: [Vendor Analytics]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           category_name:
 *                             type: string
 *                             example: "Earrings"
 *                           item_count:
 *                             type: integer
 *                             example: 60
 *                           total_weight:
 *                             type: string
 *                             example: "1500.00"
 *                           total_value:
 *                             type: string
 *                             example: "250000.00"
 */

/**
 * @openapi
 * /api/v1/vendor-analytics/transaction-history:
 *   get:
 *     summary: Get transaction history
 *     description: Returns GRN transactions with payment details and outstanding amounts, with pagination
 *     tags: [Vendor Analytics]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: vendor_id
 *         schema:
 *           type: integer
 *         description: Filter by vendor ID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from this date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter until this date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           grn_no:
 *                             type: string
 *                             example: "GRN 01/24-25"
 *                           date:
 *                             type: string
 *                             format: date
 *                             example: "2025-02-12"
 *                           vendor_id:
 *                             type: integer
 *                             example: 2
 *                           vendor_name:
 *                             type: string
 *                             example: "ThangaSakthi Silver"
 *                           vendor_code:
 *                             type: string
 *                             example: "VEN/02/24-25"
 *                           total_purchase:
 *                             type: string
 *                             example: "150000.00"
 *                           total_paid:
 *                             type: string
 *                             example: "120000.00"
 *                           outstanding:
 *                             type: string
 *                             example: "30000.00"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total:
 *                           type: integer
 *                           example: 50
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 */
