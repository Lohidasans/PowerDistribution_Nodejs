var express = require("express");
var ledgerRouter = express.Router();
const ledgerService = require("../services/ledgerService");

ledgerRouter.post("/ledgers", ledgerService.create);
ledgerRouter.post("/ledgers/bulk", ledgerService.bulkCreate);
ledgerRouter.get("/ledgers", ledgerService.list);
ledgerRouter.get("/ledgers/:id", ledgerService.getById);
ledgerRouter.get(
  "/ledgers/group/:ledgerGroupId",
  ledgerService.getByLedgerGroupId
);
ledgerRouter.put("/ledgers/:id", ledgerService.update);
ledgerRouter.delete("/ledgers/:id", ledgerService.remove);

module.exports = ledgerRouter;

/**
 * @openapi
 * tags:
 *   - name: Ledgers
 *     description: Ledger management
 */

/**
 * @openapi
 * /api/v1/ledgers:
 *   get:
 *     summary: List ledgers
 *     tags: [Ledgers]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by ledger name
 *       - in: query
 *         name: ledger_group_id
 *         schema: { type: integer }
 *         description: Filter by ledger group ID
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ledgers:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Ledger'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server Error
 *
 *   post:
 *     summary: Create a new ledger
 *     tags: [Ledgers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ledger_group_id
 *               - ledger_name
 *             properties:
 *               ledger_group_id:
 *                 type: integer
 *                 description: ID of the ledger group
 *               ledger_name:
 *                 type: string
 *                 description: Name of the ledger
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */

/**
 * @openapi
 * /api/v1/ledgers/bulk:
 *   post:
 *     summary: Create multiple ledgers
 *     tags: [Ledgers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ledgers
 *             properties:
 *               ledgers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - ledger_group_id
 *                     - ledger_name
 *                   properties:
 *                     ledger_group_id:
 *                       type: integer
 *                     ledger_name:
 *                       type: string
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */

/**
 * @openapi
 * /api/v1/ledgers/{id}:
 *   get:
 *     summary: Get a ledger by ID
 *     tags: [Ledgers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Ledger ID
 *     responses:
 *       200:
 *         description: Success
 *       404:
 *         description: Not Found
 *       500:
 *         description: Server Error
 *
 *   put:
 *     summary: Update a ledger
 *     tags: [Ledgers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Ledger ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ledger_group_id:
 *                 type: integer
 *               ledger_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Bad Request
 *       404:
 *         description: Not Found
 *       500:
 *         description: Server Error
 *
 *   delete:
 *     summary: Delete a ledger
 *     tags: [Ledgers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Ledger ID
 *     responses:
 *       200:
 *         description: Success
 *       404:
 *         description: Not Found
 *       500:
 *         description: Server Error
 */

/**
 * @openapi
 * /api/v1/ledgers/group/{ledgerGroupId}:
 *   get:
 *     summary: Get ledgers by ledger group ID
 *     tags: [Ledgers]
 *     parameters:
 *       - in: path
 *         name: ledgerGroupId
 *         required: true
 *         schema: { type: integer }
 *         description: Ledger Group ID
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Success
 *       404:
 *         description: Not Found
 *       500:
 *         description: Server Error
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Ledger:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Primary key
 *         ledger_group_id:
 *           type: integer
 *           description: ID of the ledger group this ledger belongs to
 *         ledger_name:
 *           type: string
 *           description: Name of the ledger
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         ledgerGroup:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             ledger_group_id:
 *               type: string
 *             ledger_group_name:
 *               type: string
 *     Pagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           description: Total number of records
 *         page:
 *           type: integer
 *           description: Current page number
 *         limit:
 *           type: integer
 *           description: Records per page
 *         totalPages:
 *           type: integer
 *           description: Total number of pages
 */
