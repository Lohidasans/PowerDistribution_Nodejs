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
