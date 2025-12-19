const express = require("express");
const router = express.Router();
const service = require("../services/customerAddressService");

router.post("/customer-addresses", service.createAddress);
router.get("/customer-addresses", service.getAddresses);
router.get("/customer-addresses/:id", service.getAddressById);
router.put("/customer-addresses/bulk", service.bulkUpdateAddresses);
router.delete("/customer-addresses/:id", service.deleteAddress);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Customer Addresses
 *   description: Manage customer delivery addresses (Bulk Create & Bulk Update)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CustomerAddress:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 5
 *         customer_id:
 *           type: integer
 *           example: 12
 *         name:
 *           type: string
 *           example: Charan
 *         mobile_number:
 *           type: string
 *           example: "9944085895"
 *         address_line:
 *           type: string
 *           example: "31/11, Anna Nagar, Chennai"
 *         country_id:
 *           type: integer
 *           example: 1
 *         state_id:
 *           type: integer
 *           example: 33
 *         district_id:
 *           type: integer
 *           example: 101
 *         pin_code:
 *           type: string
 *           example: "600040"
 *         is_default:
 *           type: boolean
 *           example: true
 *         created_at:
 *           type: string
 *           example: "2025-01-20T10:15:00Z"
 *
 *     BulkCreateAddressRequest:
 *       type: object
 *       required:
 *         - addresses
 *       properties:
 *         addresses:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CustomerAddress'
 *
 *     BulkUpdateAddressRequest:
 *       type: object
 *       required:
 *         - addresses
 *       properties:
 *         addresses:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 example: 5
 *               name:
 *                 type: string
 *               mobile_number:
 *                 type: string
 *               address_line:
 *                 type: string
 *               country_id:
 *                 type: integer
 *               state_id:
 *                 type: integer
 *               district_id:
 *                 type: integer
 *               pin_code:
 *                 type: string
 *               is_default:
 *                 type: boolean
 */

/**
 * @swagger
 * /api/v1/customer-addresses:
 *   post:
 *     tags: [Customer Addresses]
 *     summary: Bulk create customer addresses
 *     description: Create one or more addresses for a customer. Only one address can be default.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkCreateAddressRequest'
 *     responses:
 *       201:
 *         description: Addresses created successfully
 */

/**
 * @swagger
 * /api/v1/customer-addresses:
 *   get:
 *     tags: [Customer Addresses]
 *     summary: Get customer addresses
 *     parameters:
 *       - in: query
 *         name: customer_id
 *         required: false
 *         schema:
 *           type: integer
 *           example: 12
 *     responses:
 *       200:
 *         description: List of customer addresses
 */

/**
 * @swagger
 * /api/v1/customer-addresses/{id}:
 *   get:
 *     tags: [Customer Addresses]
 *     summary: Get address by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       200:
 *         description: Address details
 *       404:
 *         description: Address not found
 */

/**
 * @swagger
 * /api/v1/customer-addresses/bulk:
 *   put:
 *     tags: [Customer Addresses]
 *     summary: Bulk update customer addresses
 *     description: Update multiple addresses at once. Ensures only one default address per customer.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkUpdateAddressRequest'
 *     responses:
 *       200:
 *         description: Addresses updated successfully
 */

/**
 * @swagger
 * /api/v1/customer-addresses/{id}:
 *   delete:
 *     tags: [Customer Addresses]
 *     summary: Delete customer address (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       204:
 *         description: Address deleted successfully
 *       404:
 *         description: Address not found
 */
