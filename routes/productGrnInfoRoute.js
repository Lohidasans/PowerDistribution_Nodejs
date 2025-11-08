const express = require("express");
const router = express.Router();
const svc = require("../services/productGrnInfoService");

// Routes
router.post("/product-grn-infos", svc.createProductGrnInfo);
router.get("/product-grn-infos", svc.getAllProductGrnInfos);
router.get("/product-grn-infos/:id", svc.getProductGrnInfoById);
router.delete("/product-grn-infos/:id", svc.deleteProductGrnInfo);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: ProductGrnInfo
 *     description: Product GRN Information Management
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     ProductGrnInfo:
 *       type: object
 *       required:
 *         - grn_id
 *         - material_type_id
 *         - category_id
 *         - subcategory_id
 *       properties:
 *         grn_id:
 *           type: integer
 *         ref_no:
 *           type: string
 *         material_type_id:
 *           type: integer
 *         purity:
 *           type: number
 *           format: float
 *         material_price_per_g:
 *           type: number
 *           format: float
 *         category_id:
 *           type: integer
 *         subcategory_id:
 *           type: integer
 *         type:
 *           type: string
 *           enum: [Weight, Piece]
 *         quantity:
 *           type: integer
 *         gross_wt_in_g:
 *           type: number
 *           format: float
 *         stone_wt_in_g:
 *           type: number
 *           format: float
 *         others:
 *           type: string
 *         others_wt_in_g:
 *           type: number
 *           format: float
 *         others_value:
 *           type: number
 *           format: float
 *         net_wt_in_g:
 *           type: number
 *           format: float
 *         purchase_rate:
 *           type: number
 *           format: float
 *         stone_rate:
 *           type: number
 *           format: float
 *         making_charge:
 *           type: number
 *           format: float
 *         rate_per_g:
 *           type: number
 *           format: float
 *         total_amount:
 *           type: number
 *           format: float
 */

/**
 * @openapi
 * /api/v1/product-grn-infos:
 *   post:
 *     summary: Create a new Product GRN Info
 *     tags: [ProductGrnInfo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductGrnInfo'
 *     responses:
 *       201:
 *         description: Product GRN Info created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/product-grn-infos:
 *   get:
 *     summary: Get all Product GRN Infos with pagination and filters
 *     tags: [ProductGrnInfo]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: grn_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: material_type_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: subcategory_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of Product GRN Infos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/product-grn-infos/{id}:
 *   get:
 *     summary: Get a Product GRN Info by ID
 *     tags: [ProductGrnInfo]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product GRN Info details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/product-grn-infos/{id}:
 *   delete:
 *     summary: Delete a Product GRN Info (soft delete)
 *     tags: [ProductGrnInfo]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product GRN Info deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

