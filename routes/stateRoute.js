var express = require("express");
var stateRouter = express.Router();
const stateService = require("../services/stateService");

// CRUD
stateRouter.post("/state", stateService.createState);
stateRouter.get("/state", stateService.getAllStates);
stateRouter.get("/state/dropdown", stateService.listStatesDropdown);
stateRouter.get("/state/:id", stateService.getStateById);
stateRouter.put("/state/:id", stateService.updateState);
stateRouter.delete("/state/:id", stateService.deleteState);

module.exports = stateRouter;

/**
 * @openapi
 * tags:
 *   - name: State
 *     description: State management
 */

/**
 * @openapi
 * /api/v1/state:
 *   get:
 *     summary: List states with country details
 *     tags: [State]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by state name or state code
 *       - in: query
 *         name: country_id
 *         schema:
 *           type: integer
 *         description: Filter by country ID
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create states (bulk)
 *     tags: [State]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StateInput'
 *     responses:
 *       201:
 *         description: States created successfully
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     StateInput:
 *       type: object
 *       properties:
 *         states:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               country_id:
 *                 type: integer
 *                 example: 1
 *               state_code:
 *                 type: string
 *                 example: "TN"
 *               state_name:
 *                 type: string
 *                 example: "Tamil Nadu"
 *       required:
 *         - states
 */

/**
 * @openapi
 * /api/v1/state/dropdown:
 *   get:
 *     summary: List states for dropdown (id and state_name only)
 *     tags: [State]
 *     parameters:
 *       - in: query
 *         name: country_id
 *         schema:
 *           type: integer
 *         description: Filter by country ID
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/state/{id}:
 *   get:
 *     summary: Get state by ID
 *     tags: [State]
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
 *     summary: Update state by ID
 *     tags: [State]
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
 *             $ref: '#/components/schemas/StateInput'
 *     responses:
 *       200:
 *         description: Updated successfully
 *   delete:
 *     summary: Delete state (soft delete)
 *     tags: [State]
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
