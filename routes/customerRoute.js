var express = require("express");
var router = express.Router();
const customerService = require("../services/customerService");

// CRUD
router.post("/customers", customerService.createCustomer);
router.get("/customers/list", customerService.listCustomers);
router.get("/customers", customerService.listCustomersWithMobileNumber);
router.get("/customers/mobile/dropdown", customerService.listCustomerMobilesDropdown);
router.get("/customers/dropdown", customerService.listCustomerNameMobileDropdown);
router.get("/customers/top-buying", customerService.getTopBuyingCustomers);
router.get("/customers/:id", customerService.getCustomerById);
router.put("/customers/:id", customerService.updateCustomer);
router.delete("/customers/:id", customerService.deleteCustomer);

// Code generation
router.post("/customers/code", customerService.generateCustomerCode);

module.exports = router;

/**
 * @openapi
 * /api/v1/customers/dropdown:
 *   get:
 *     summary: Dropdown - customers (name + mobile) with light search
 *     tags: [Customer]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive search on name or mobile
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: OK
 */
/**
 * @openapi
 * /api/v1/customers/mobile/dropdown:
 *   get:
 *     summary: Dropdown - distinct customer mobile numbers
 *     tags: [Customer]
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/customers/top-buying:
 *   get:
 *     summary: Get top buying customers ranked by total invoice value
 *     tags: [Customer]
 *     description: Returns customers ranked by the total value of all invoices raised across all branches or a specific branch. Excludes cancelled invoices.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Number of top customers to return
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Optional - Filter by specific branch ID
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
 *                     top_buying_customers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           customer_id: { type: integer, description: "Customer ID" }
 *                           customer_code: { type: string, description: "Customer code" }
 *                           customer_name: { type: string, description: "Customer name" }
 *                           mobile_number: { type: string, description: "Customer mobile number" }
 *                           total_amount: { type: string, description: "Total invoice amount" }
 *                           total_invoices: { type: integer, description: "Total number of invoices" }
 */


/**
 * @openapi
 * /api/v1/customers:
 *   get:
 *     summary: List customers
 *     tags: [Customer]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create customer
 *     tags: [Customer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_name, mobile_number, address, country_id, state_id, district_id, pin_code]
 *             properties:
 *               customer_code: { type: string, nullable: true }
 *               customer_name: { type: string }
 *               mobile_number: { type: string }
 *               address: { type: string }
 *               country_id: { type: integer }
 *               state_id: { type: integer }
 *               district_id: { type: integer }
 *               pin_code: { type: string }
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/customers/{id}:
 *   get:
 *     summary: Get customer by ID
 *     tags: [Customer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update customer
 *     tags: [Customer]
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
 *               customer_code: { type: string, nullable: true }
 *               customer_name: { type: string }
 *               mobile_number: { type: string }
 *               address: { type: string }
 *               country_id: { type: integer }
 *               state_id: { type: integer }
 *               district_id: { type: integer }
 *               pin_code: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete customer (soft)
 *     tags: [Customer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */

/**
 * @openapi
 * /api/v1/customers/code:
 *   post:
 *     summary: Generate customer code (Cus-0001)
 *     tags: [Customer]
 *     responses:
 *       200:
 *         description: OK
 */
