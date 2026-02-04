var express = require("express");
var branchRouter = express.Router();
const branchService = require("../services/branchService");

// Specific routes MUST come before parameterized routes
branchRouter.get("/branch/dropdown", branchService.branchDropdownList);
branchRouter.get("/branch/dashboard", branchService.getBranchDashboard);
branchRouter.get("/branch/revenue-comparison", branchService.getBranchRevenueComparison);
branchRouter.get("/branch/stats", branchService.getBranchStats);
branchRouter.get("/branch/details", branchService.getBranchDetails);
branchRouter.get("/branch/overview", branchService.getBranchOverview);
branchRouter.get("/branch/sales-statistics", branchService.getSalesStatistics);
branchRouter.get("/branch/customer-visits", branchService.getCustomerVisits);
branchRouter.get("/branch/sales-analytics", branchService.getBranchSalesAnalytics);
branchRouter.get("/branch/recent-sales", branchService.getRecentSales);
branchRouter.get("/branch/top-selling-categories", branchService.getTopSellingCategories);
branchRouter.get("/branch/stock-analytics", branchService.getStockAnalytics);
branchRouter.get("/branch/vendor-contribution", branchService.getVendorContribution);
branchRouter.get("/branch/customers", branchService.getBranchCustomers);
branchRouter.get("/branch/customers/:customer_id/invoices", branchService.getCustomerInvoices);
branchRouter.get("/branch/vendors", branchService.getBranchVendors);
branchRouter.get("/branch/vendors/payments", branchService.getVendorPaymentDetails);
branchRouter.post("/branch/code", branchService.generateBranchCode);

// General routes
branchRouter.post("/branch", branchService.createBranch);
branchRouter.get("/branch", branchService.listBranches);

// Parameterized routes MUST come last
branchRouter.get("/branch/:id", branchService.getBranchById);
branchRouter.put("/branch/:id", branchService.updateBranch);
branchRouter.delete("/branch/:id", branchService.deleteBranch);

module.exports = branchRouter;
/**
 * @openapi
 * tags:
 *   - name: Branch
 *     description: Branch management
 */
/**
 * @openapi
 * /api/v1/branch/code:
 *   post:
 *     summary: Generate next branch code
 *     tags: [Branch]
 *     parameters:
 *       - in: query
 *         name: company_code
 *         schema: { type: string }
 *         required: true
 *         description: Company code prefix (e.g., CJ)
 *       - in: query
 *         name: location_code
 *         schema: { type: string }
 *         required: true
 *         description: Location code prefix (e.g., SLM)
 *     description: Returns a unique code like CJ_SLM_001 for the provided prefixes.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branch_code: { type: string, example: "CJ_SLM_001" }
 */
/**
 * @openapi
 * /api/v1/branch/dashboard:
 *   get:
 *     summary: Get comprehensive branch dashboard statistics
 *     tags: [Branch]
 *     description: Returns comprehensive dashboard data including branch statistics, top buying customers, and top employee performers across all branches or filtered by a specific branch.
 *     parameters:
 *       - in: query
 *         name: top_limit
 *         schema: { type: integer, default: 5 }
 *         description: Number of top customers and employees to return
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Optional - Filter top customers and employees by specific branch ID
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branch_statistics:
 *                       type: object
 *                       properties:
 *                         total_branches: { type: integer, description: "Total number of branches created under super admin" }
 *                         active_branches: { type: integer, description: "Number of branches with Active status" }
 *                         inactive_branches: { type: integer, description: "Number of branches with Inactive status" }
 *                     top_buying_customers:
 *                       type: array
 *                       description: "Top customers ranked by total invoice value"
 *                       items:
 *                         type: object
 *                         properties:
 *                           customer_id: { type: integer }
 *                           customer_code: { type: string }
 *                           customer_name: { type: string }
 *                           mobile_number: { type: string }
 *                           total_amount: { type: string }
 *                           total_invoices: { type: integer }
 *                     top_employee_performers:
 *                       type: array
 *                       description: "Top employees ranked by cumulative sales value"
 *                       items:
 *                         type: object
 *                         properties:
 *                           employee_id: { type: integer }
 *                           employee_no: { type: string }
 *                           employee_name: { type: string }
 *                           weight: { type: string }
 *                           sales_amount: { type: string }
 *                           total_invoices: { type: integer }
 */

/**
 * @openapi
 * /api/v1/branch/revenue-comparison:
 *   get:
 *     summary: Get branch revenue comparison with flexible date filtering
 *     tags: [Branch]
 *     description: Returns revenue comparison across all branches with total collections, invoice counts, and revenue percentages. Supports predefined periods (today, this_week, this_month, this_year) or custom date ranges.
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: 
 *           type: string
 *           enum: [today, this_week, this_month, this_year]
 *         description: Predefined time period for filtering (mutually exclusive with start_date/end_date)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Start date for custom date range (YYYY-MM-DD format)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: End date for custom date range (YYYY-MM-DD format)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_revenue: { type: string, description: "Total revenue across all branches" }
 *                         total_branches: { type: integer, description: "Number of branches" }
 *                         period: { type: string, description: "Applied period filter" }
 *                         start_date: { type: string, description: "Effective start date" }
 *                         end_date: { type: string, description: "Effective end date" }
 *                     branches:
 *                       type: array
 *                       description: "Branches ranked by revenue (highest first)"
 *                       items:
 *                         type: object
 *                         properties:
 *                           branch_id: { type: integer }
 *                           branch_no: { type: string }
 *                           branch_name: { type: string }
 *                           status: { type: string }
 *                           total_revenue: { type: string, description: "Total revenue for this branch" }
 *                           total_invoices: { type: integer, description: "Number of invoices" }
 *                           average_invoice_value: { type: string, description: "Average invoice amount" }
 *                           revenue_percentage: { type: string, description: "Percentage of total revenue" }
 *                           first_invoice_date: { type: string, description: "Date of first invoice in period" }
 *                           last_invoice_date: { type: string, description: "Date of last invoice in period" }
 */

/**
 * @openapi
 * /api/v1/branch/stats:
 *   get:
 *     summary: Get comprehensive branch statistics table
 *     tags: [Branch]
 *     description: Returns comprehensive branch statistics including sales value, purchase value, stock value, total revenue, and employee count. Perfect for displaying branch stats table with flexible date filtering for sales/revenue data.
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: 
 *           type: string
 *           enum: [today, this_week, this_month, this_year]
 *         description: Predefined time period for filtering sales/revenue data
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Start date for custom date range (YYYY-MM-DD format)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: End date for custom date range (YYYY-MM-DD format)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branch_stats:
 *                       type: array
 *                       description: "Branch statistics ordered by branch ID"
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no: { type: integer, description: "Serial number" }
 *                           branch_name: { type: string, description: "Branch name" }
 *                           sales_value: { type: string, description: "Total sales invoice amount in period" }
 *                           purchase_value: { type: string, description: "Total purchase/GRN value of products" }
 *                           stock_value: { type: string, description: "Current stock value based on remaining inventory" }
 *                           total_revenue: { type: string, description: "Total revenue (same as sales value)" }
 *                           total_employee: { type: integer, description: "Number of employees in branch" }
 *                           branch_id: { type: integer, description: "Branch ID" }
 *                           branch_no: { type: string, description: "Branch code" }
 *                           status: { type: string, description: "Branch status" }
 *                     period: { type: string, description: "Applied period filter" }
 *                     start_date: { type: string, description: "Effective start date" }
 *                     end_date: { type: string, description: "Effective end date" }
 */

/**
 * @openapi
 * /api/v1/branch/details:
 *   get:
 *     summary: Get branch details with location information
 *     tags: [Branch]
 *     description: Returns detailed information about all branches including branch number, name, location (district), branch admin contact person, and contact number. Joins branches and districts tables.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branch_details:
 *                       type: array
 *                       description: "List of all branches with location details"
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no: { type: integer, description: "Serial number" }
 *                           branch_no: { type: string, description: "Branch number/code" }
 *                           branch_name: { type: string, description: "Branch name" }
 *                           location: { type: string, description: "District name (location)" }
 *                           branch_admin: { type: string, description: "Contact person/branch admin" }
 *                           contact_number: { type: string, description: "Mobile number" }
 *                           branch_id: { type: integer, description: "Branch ID" }
 *                           email: { type: string, description: "Email address" }
 *                           address: { type: string, description: "Full address" }
 *                           status: { type: string, description: "Branch status" }
 *                           district_id: { type: integer, description: "District ID" }
 *                           state_id: { type: integer, description: "State ID" }
 *                           pin_code: { type: string, description: "PIN code" }
 *                           gst_no: { type: string, description: "GST number" }
 *                     total_branches: { type: integer, description: "Total number of branches" }
 */

/**
 * @openapi
 * /api/v1/branch/overview:
 *   get:
 *     summary: Get comprehensive branch-wise overview
 *     tags: [Branch]
 *     description: Returns comprehensive overview for each branch including total customers, total revenue (from sales invoices and jewel repairs), total stock value, and total stock weight. Can be filtered by specific branch.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Filter by specific branch ID (optional)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     branch_overview:
 *                       type: array
 *                       description: "Comprehensive overview for each branch"
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no: { type: integer, description: "Serial number" }
 *                           branch_id: { type: integer, description: "Branch ID" }
 *                           branch_no: { type: string, description: "Branch number/code" }
 *                           branch_name: { type: string, description: "Branch name" }
 *                           status: { type: string, description: "Branch status" }
 *                           total_customers: { type: integer, description: "Total unique customers who made purchases" }
 *                           total_revenue: { type: string, description: "Total revenue from all sources" }
 *                           revenue_breakdown:
 *                             type: object
 *                             properties:
 *                               sales_invoice: { type: string, description: "Revenue from sales invoices" }
 *                               jewel_repair: { type: string, description: "Revenue from jewel repairs" }
 *                           total_stock_value: { type: string, description: "Total purchase value of stock" }
 *                           total_stock_weight: { type: string, description: "Total remaining weight of stock" }
 *                     total_branches: { type: integer, description: "Total number of branches" }
 */

/**
 * @openapi
 * /api/v1/branch/sales-statistics:
 *   get:
 *     summary: Get sales statistics for graphical representation
 *     tags: [Branch]
 *     description: Returns time-series sales data grouped by yearly, monthly, or weekly periods for a specific branch. Perfect for chart visualization with complete data points (fills missing periods with zeros).
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         required: true
 *         schema: { type: integer }
 *         description: Branch ID (required)
 *       - in: query
 *         name: period
 *         schema: 
 *           type: string
 *           enum: [yearly, monthly, weekly]
 *           default: monthly
 *         description: Time period grouping (yearly=last 10 years, monthly=12 months, weekly=days of week Sun-Sat)
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *         description: Year for monthly/weekly data (defaults to current year)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sales_statistics:
 *                       type: array
 *                       description: "Time-series sales data for chart visualization"
 *                       items:
 *                         type: object
 *                         properties:
 *                           period: { type: string, description: "Period label (e.g., 'Jan', 'Week 1', '2026')" }
 *                           total_sales: { type: string, description: "Total sales amount for the period" }
 *                           total_invoices: { type: integer, description: "Number of invoices in the period" }
 *                     period: { type: string, description: "Applied period filter" }
 *                     year: { type: integer, description: "Year for the data" }
 *                     branch_id: { type: integer, description: "Branch ID" }
 *       400:
 *         description: Bad Request - branch_id is required
 */

/**
 * @openapi
 * /api/v1/branch/customer-visits:
 *   get:
 *     summary: Get customer visits (invoice counts) stats
 *     tags: [Branch]
 *     description: Returns customer visit statistics based on invoice counts, grouped by day of the week (Mon-Sun). Defaults to current week if no date range is provided.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Branch ID (optional)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     customer_visits:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           day: { type: string, description: "Day of week (Mon, Tue...)" }
 *                           visits: { type: integer, description: "Number of invoices/visits" }
 *                     total_visits: { type: integer, description: "Total visits for the period" }
 */

/**
 * @openapi
 * /api/v1/branch/sales-analytics:
 *   get:
 *     summary: Get comprehensive branch sales analytics
 *     tags: [Branch]
 *     description: Returns comprehensive sales analytics including sales metrics, revenue breakdown by payment method, sales by group (pie chart data), and stock metrics.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         required: true
 *         schema: { type: integer }
 *         description: Branch ID (required)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Start date for period filtering (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: End date for period filtering (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sales_metrics:
 *                       type: object
 *                       properties:
 *                         total_sales_value: { type: string, description: "Total sales value for period" }
 *                         total_weight_value: { type: string, description: "Total stock weight in grams" }
 *                         total_stock_value: { type: string, description: "Total stock purchase value" }
 *                     revenue:
 *                       type: object
 *                       properties:
 *                         cash: { type: string, description: "Cash collection for period" }
 *                         upi: { type: string, description: "UPI collection for period" }
 *                         card: { type: string, description: "Card collection for period" }
 *                     sales_by_group:
 *                       type: array
 *                       description: "Sales breakdown by group (for pie chart)"
 *                       items:
 *                         type: object
 *                         properties:
 *                           group: { type: string, description: "Group name (Sales, Repair, Scheme)" }
 *                           amount: { type: string, description: "Total amount for group" }
 *                     stock:
 *                       type: object
 *                       properties:
 *                         opening_stock: { type: string, description: "Opening stock weight in grams" }
 *                         sales_stock: { type: string, description: "Sales stock weight in grams" }
 *                         old_jewel: { type: string, description: "Old jewel weight in grams" }
 *                         closing_stock: { type: string, description: "Closing stock weight in grams" }
 *       400:
 *         description: Bad Request - branch_id is required
 */

/**
 * @openapi
 * /api/v1/branch/recent-sales:
 *   get:
 *     summary: Get recent sales invoices for selected period
 *     tags: [Branch]
 *     description: Returns a list of recent sales invoices with invoice number, date, product name, weights, quantity, and total amount. Invoice number can be used as a hyperlink to view the sales invoice detail page.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Filter by specific branch ID (optional)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Start date for period filtering (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: End date for period filtering (YYYY-MM-DD)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Maximum number of records to return
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     recent_sales:
 *                       type: array
 *                       description: "List of recent sales invoices"
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no: { type: integer, description: "Serial number" }
 *                           date: { type: string, format: date, description: "Invoice date" }
 *                           invoice_no: { type: string, description: "Invoice number (use as hyperlink)" }
 *                           invoice_id: { type: integer, description: "Invoice ID for detail page" }
 *                           product_name: { type: string, description: "Product name" }
 *                           grs_weight: { type: string, description: "Gross weight in grams" }
 *                           net_weight: { type: string, description: "Net weight in grams" }
 *                           quantity: { type: integer, description: "Quantity" }
 *                           total_amount: { type: string, description: "Total amount" }
 *                     total_records: { type: integer, description: "Number of records returned" }
 */

/**
 * @openapi
 * /api/v1/branch/top-selling-categories:
 *   get:
 *     summary: Get top selling categories by invoice count
 *     tags: [Branch]
 *     description: Returns the most sold jewelry categories based on total number of invoices raised. Each category includes image URL, name, total invoices, and cumulative sales amount.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Filter by specific branch ID (optional)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Start date for period filtering (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: End date for period filtering (YYYY-MM-DD)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Maximum number of categories to return
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     top_selling_categories:
 *                       type: array
 *                       description: "List of top selling categories"
 *                       items:
 *                         type: object
 *                         properties:
 *                           category_id: { type: integer, description: "Category ID" }
 *                           category_name: { type: string, description: "Category name (e.g., Necklace, Bangles)" }
 *                           category_image_url: { type: string, description: "Category image URL" }
 *                           total_invoices: { type: integer, description: "Total number of invoices" }
 *                           total_sales_amount: { type: string, description: "Total sales amount" }
 *                     total_results: { type: integer, description: "Number of results returned" }
 */

/**
 * @openapi
 * /api/v1/branch/stock-analytics:
 *   get:
 *     summary: Get comprehensive stock management analytics
 *     tags: [Branch]
 *     description: Returns stock analytics including total quantity (stock in hand), stock by category for bar chart, top 5 low stock subcategories, and top 5 out of stock subcategories.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         required: true
 *         schema: { type: integer }
 *         description: Branch ID (required)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Start date for filtering products (YYYY-MM-DD or DD-MM-YYYY)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: End date for filtering products (YYYY-MM-DD or DD-MM-YYYY)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_quantity:
 *                       type: object
 *                       properties:
 *                         total_quantity: { type: integer, description: "Total product count" }
 *                         total_weight: { type: string, description: "Total weight in grams" }
 *                     stock_by_category:
 *                       type: array
 *                       description: "Stock breakdown by category for bar chart"
 *                       items:
 *                         type: object
 *                         properties:
 *                           category_name: { type: string, description: "Category name" }
 *                           total_weight: { type: string, description: "Total weight in grams" }
 *                     low_stock:
 *                       type: object
 *                       properties:
 *                         count: { type: integer, description: "Number of low stock items" }
 *                         total_weight: { type: string, description: "Total weight of low stock items" }
 *                         items:
 *                           type: array
 *                           description: "Top 5 low stock subcategories"
 *                           items:
 *                             type: object
 *                             properties:
 *                               subcategory_name: { type: string, description: "Subcategory name" }
 *                               quantity: { type: integer, description: "Current quantity" }
 *                               reorder_level: { type: integer, description: "Reorder level threshold" }
 *                     out_of_stock:
 *                       type: object
 *                       properties:
 *                         count: { type: integer, description: "Number of out of stock items" }
 *                         total_weight: { type: string, description: "Total weight (always 0)" }
 *                         items:
 *                           type: array
 *                           description: "Top 5 out of stock subcategories"
 *                           items:
 *                             type: object
 *                             properties:
 *                               subcategory_name: { type: string, description: "Subcategory name" }
 *                               reorder_level: { type: integer, description: "Reorder level threshold" }
 *       400:
 *         description: Bad Request - branch_id is required
 */

/**
 * @openapi
 * /api/v1/branch/vendor-contribution:
 *   get:
 *     summary: Get vendor contribution analytics
 *     tags: [Branch]
 *     description: Returns vendor contribution showing GRNs (Goods Receipt Notes) raised from each vendor along with their total values for bar chart visualization.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Filter by specific branch ID (optional)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Start date for filtering GRNs (YYYY-MM-DD or DD-MM-YYYY)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: End date for filtering GRNs (YYYY-MM-DD or DD-MM-YYYY)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vendor_contributions:
 *                       type: array
 *                       description: "List of vendor contributions"
 *                       items:
 *                         type: object
 *                         properties:
 *                           vendor_id: { type: integer, description: "Vendor ID" }
 *                           vendor_name: { type: string, description: "Vendor name (e.g., Golden Hub Pvt. Ltd.)" }
 *                           total_grns: { type: integer, description: "Total number of GRNs raised" }
 *                           total_value: { type: string, description: "Total value of all GRNs" }
 *                     total_vendors: { type: integer, description: "Number of vendors" }
 */

/**
 * @openapi
 * /api/v1/branch/customers:
 *   get:
 *     summary: Get customers associated with a branch
 *     tags: [Branch]
 *     description: Returns a list of customers who have made purchases at the specified branch, including customer details, order count, and total purchase amount. Supports pagination.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         required: true
 *         schema: { type: integer }
 *         description: Branch ID (required)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Number of records per page
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: Number of records to skip
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     customers:
 *                       type: array
 *                       description: "List of customers"
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no: { type: integer, description: "Serial number" }
 *                           customer_id: { type: integer, description: "Customer ID (clickable to view invoices)" }
 *                           customer_no: { type: string, description: "Customer code (e.g., CID 01/24-25)" }
 *                           customer_name: { type: string, description: "Customer name" }
 *                           mobile_number: { type: string, description: "Mobile number" }
 *                           total_no_of_order: { type: integer, description: "Total number of orders" }
 *                           purchase_amount: { type: string, description: "Total purchase amount" }
 *                     total_count: { type: integer, description: "Total number of customers" }
 *                     current_page: { type: integer, description: "Current page number" }
 *                     per_page: { type: integer, description: "Records per page" }
 *       400:
 *         description: Bad Request - branch_id is required
 */

/**
 * @openapi
 * /api/v1/branch/customers/{customer_id}/invoices:
 *   get:
 *     summary: Get all invoices for a specific customer
 *     tags: [Branch]
 *     description: Returns all invoices raised for a specific customer across all branches. Used when clicking on a customer ID from the customer list.
 *     parameters:
 *       - in: path
 *         name: customer_id
 *         required: true
 *         schema: { type: integer }
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoices:
 *                       type: array
 *                       description: "List of invoices"
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no: { type: integer, description: "Serial number" }
 *                           invoice_id: { type: integer, description: "Invoice ID" }
 *                           invoice_no: { type: string, description: "Invoice number" }
 *                           invoice_date: { type: string, format: date, description: "Invoice date" }
 *                           branch_name: { type: string, description: "Branch name" }
 *                           total_items: { type: integer, description: "Number of items in invoice" }
 *                           total_amount: { type: string, description: "Total invoice amount" }
 *                           status: { type: string, description: "Invoice status" }
 *                     total_invoices: { type: integer, description: "Total number of invoices" }
 *       400:
 *         description: Bad Request - customer_id is required
 */

/**
 * @openapi
 * /api/v1/branch/vendors:
 *   get:
 *     summary: Get vendors associated with a branch
 *     tags: [Branch]
 *     description: Returns a list of vendors marked for the specified branch in their visibility settings during vendor creation.
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         required: true
 *         schema: { type: integer }
 *         description: Branch ID (required)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vendors:
 *                       type: array
 *                       description: "List of vendors"
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no: { type: integer, description: "Serial number" }
 *                           vendor_id: { type: integer, description: "Vendor ID" }
 *                           vendor_code: { type: string, description: "Vendor code (e.g., VEN 01/24-25)" }
 *                           vendor_name: { type: string, description: "Vendor name (clickable hyperlink)" }
 *                           contact_person: { type: string, description: "Contact person name" }
 *                           contact_number: { type: string, description: "Contact number" }
 *                           material_type: { type: string, description: "Material types (comma-separated)" }
 *                           branch: { type: string, description: "Branch name" }
 *                     total_vendors: { type: integer, description: "Total number of vendors" }
 *       400:
 *         description: Bad Request - branch_id is required
 */

/**
 * @openapi
 * /api/v1/branch/vendors/payments:
 *   get:
 *     summary: Get payment/receipt details for a specific vendor
 *     tags: [Branch]
 *     description: Returns GRN and payment details for a specific vendor at a branch. Shows total purchase, total paid, and outstanding amounts. Used when clicking on vendor name from vendor list.
 *     parameters:
 *       - in: query
 *         name: vendor_id
 *         required: true
 *         schema: { type: integer }
 *         description: Vendor ID (required)
 *       - in: query
 *         name: branch_id
 *         required: true
 *         schema: { type: integer }
 *         description: Branch ID (required)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     payments:
 *                       type: array
 *                       description: "List of GRN/payment records"
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no: { type: integer, description: "Serial number" }
 *                           grn_id: { type: integer, description: "GRN ID" }
 *                           grn_no: { type: string, description: "GRN number" }
 *                           date: { type: string, format: date, description: "GRN date" }
 *                           total_purchase: { type: string, description: "Total purchase amount" }
 *                           total_paid: { type: string, description: "Total amount paid" }
 *                           outstanding: { type: string, description: "Outstanding amount" }
 *                     total_records: { type: integer, description: "Total number of records" }
 *       400:
 *         description: Bad Request - vendor_id and branch_id are required
 */

/**
 * @openapi
 * /api/v1/branch:
 *   get:
 *     summary: List branches
 *     tags: [Branch]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Active, Inactive] }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create branch with optional bank account, KYC docs, and login (create-only for related entities)
 *     tags: [Branch]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               branch_no: { type: string }
 *               branch_name: { type: string }
 *               contact_person: { type: string }
 *               mobile: { type: string }
 *               email: { type: string }
 *               address: { type: string }
 *               district_id: { type: integer }
 *               state_id: { type: integer }
 *               pin_code: { type: string }
 *               gst_no: { type: string }
 *               signature_url: { type: string }
 *               status: { type: string, enum: [Active, Inactive] }
 *               bank_account:
 *                 type: object
 *                 description: Optional bank account to create for this branch
 *                 properties:
 *                   account_holder_name: { type: string }
 *                   bank_name: { type: string }
 *                   ifsc_code: { type: string }
 *                   account_number: { type: string }
 *                   bank_branch_name: { type: string }
 *               kyc_documents:
 *                 type: array
 *                 description: Optional list of KYC docs to attach
 *                 items:
 *                   type: object
 *                   properties:
 *                     doc_type: { type: string, example: GST }
 *                     doc_number: { type: string }
 *                     file_url: { type: string }
 *               login:
 *                 type: object
 *                 description: Optional login to create for this branch
 *                 properties:
 *                   email: { type: string }
 *                   password_hash: { type: string }
 *                   role_id: { type: integer }
 *     responses:
 *       201:
 *         description: Created
 */
/**
 * @openapi
 * /api/v1/branch/{id}:
 *   get:
 *     summary: Get branch by ID
 *     tags: [Branch]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update branch with optional updates for bank account, KYC docs, and login (update-only; KYC requires id)
 *     tags: [Branch]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               branch_no: { type: string }
 *               branch_name: { type: string }
 *               contact_person: { type: string }
 *               mobile: { type: string }
 *               email: { type: string }
 *               address: { type: string }
 *               district_id: { type: integer }
 *               state_id: { type: integer }
 *               pin_code: { type: string }
 *               gst_no: { type: string }
 *               signature_url: { type: string }
 *               status: { type: string, enum: [Active, Inactive] }
 *               bank_account:
 *                 type: object
 *                 properties:
 *                   account_holder_name: { type: string }
 *                   bank_name: { type: string }
 *                   ifsc_code: { type: string }
 *                   account_number: { type: string }
 *                   bank_branch_name: { type: string }
 *               kyc_documents:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: integer, description: Include to update existing KYC }
 *                     doc_type: { type: string }
 *                     doc_number: { type: string }
 *                     file_url: { type: string }
 *               login:
 *                 type: object
 *                 properties:
 *                   email: { type: string }
 *                   password_hash: { type: string }
 *                   role_id: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete branch (soft)
 *     tags: [Branch]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
