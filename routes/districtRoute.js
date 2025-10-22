var express = require("express");
var districtRouter = express.Router();
const districtService = require("../services/districtService");

// CRUD
districtRouter.post("/district", districtService.createDistrict);
districtRouter.get("/district", districtService.getAllDistricts);
districtRouter.get("/district/dropdown", districtService.listDistrictsDropdown);
districtRouter.get("/district/:id", districtService.getDistrictById);
districtRouter.put("/district/:id", districtService.updateDistrict);
districtRouter.delete("/district/:id", districtService.deleteDistrict);

module.exports = districtRouter;

/**
 * @openapi
 * tags:
 *   - name: District
 *     description: District management
 */

/**
 * @openapi
 * /api/v1/district:
 *   get:
 *     summary: List districts with country and state details
 *     tags: [District]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by district name or short name
 *       - in: query
 *         name: country_id
 *         schema:
 *           type: integer
 *         description: Filter by country ID
 *       - in: query
 *         name: state_id
 *         schema:
 *           type: integer
 *         description: Filter by state ID
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create districts (bulk)
 *     tags: [District]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DistrictInput'
 *     responses:
 *       201:
 *         description: Districts created successfully
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     DistrictInput:
 *       type: object
 *       properties:
 *         districts:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               country_id:
 *                 type: integer
 *                 example: 1
 *               state_id:
 *                 type: integer
 *                 example: 5
 *               short_name:
 *                 type: string
 *                 example: "CBE"
 *               district_name:
 *                 type: string
 *                 example: "Coimbatore"
 *       required:
 *         - districts
 */

/**
 * @openapi
 * /api/v1/district/dropdown:
 *   get:
 *     summary: List districts for dropdown (id and district_name only)
 *     tags: [District]
 *     parameters:
 *       - in: query
 *         name: country_id
 *         schema:
 *           type: integer
 *         description: Filter by country ID
 *       - in: query
 *         name: state_id
 *         schema:
 *           type: integer
 *         description: Filter by state ID
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/district/{id}:
 *   get:
 *     summary: Get district by ID
 *     tags: [District]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update district by ID
 *     tags: [District]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DistrictInput'
 *     responses:
 *       200:
 *         description: Updated successfully
 *   delete:
 *     summary: Delete district (soft delete)
 *     tags: [District]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: No Content
 */
