var express = require("express");
var ledgerGroupRouter = express.Router();
const ledgerGroupService = require("../services/ledgerGroupService");

ledgerGroupRouter.post("/ledger-groups", ledgerGroupService.create);
ledgerGroupRouter.post("/ledger-groups/bulk", ledgerGroupService.bulkCreate);
ledgerGroupRouter.get("/ledger-groups", ledgerGroupService.list);
ledgerGroupRouter.get("/ledger-groups/:id", ledgerGroupService.getById);
ledgerGroupRouter.put("/ledger-groups/:id", ledgerGroupService.update);
ledgerGroupRouter.patch("/ledger-groups/:id/status", ledgerGroupService.toggleStatus);
ledgerGroupRouter.delete("/ledger-groups/:id", ledgerGroupService.remove);

module.exports = ledgerGroupRouter;

/**
 * @openapi
 * tags:
 *   - name: Ledger Groups
 *     description: Ledger groups management
 */

/**
 * @openapi
 * /api/v1/ledger-groups:
 *   get:
 *     summary: List ledger groups
 *     tags: [Ledger Groups]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by ledger group ID or name
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Number of items per page
 *       - in: query
 *         name: status_id
 *         schema: { type: integer }
 *         description: Filter by status ID
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
 *                     ledgerGroups:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LedgerGroup'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server Error
 *
 *   post:
 *     summary: Create a new ledger group
 *     tags: [Ledger Groups]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ledger_group_id
 *               - ledger_group_name
 *             properties:
 *               ledger_group_id:
 *                 type: string
 *                 description: Unique identifier for the ledger group
 *               ledger_group_name:
 *                 type: string
 *                 description: Name of the ledger group
 *               status_id:
 *                 type: integer
 *                 default: 1
 *                 description: Status of the ledger group (active/inactive)
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
 * /api/v1/ledger-groups/bulk:
 *   post:
 *     summary: Create multiple ledger groups
 *     tags: [Ledger Groups]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ledgerGroups
 *             properties:
 *               ledgerGroups:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - ledger_group_id
 *                     - ledger_group_name
 *                   properties:
 *                     ledger_group_id:
 *                       type: string
 *                     ledger_group_name:
 *                       type: string
 *                     status_id:
 *                       type: integer
 *                       default: 1
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
 * /api/v1/ledger-groups/{id}:
 *   get:
 *     summary: Get a ledger group by ID
 *     tags: [Ledger Groups]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Ledger group ID
 *     responses:
 *       200:
 *         description: Success
 *       404:
 *         description: Not Found
 *       500:
 *         description: Server Error
 *
 *   put:
 *     summary: Update a ledger group
 *     tags: [Ledger Groups]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Ledger group ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ledger_group_id:
 *                 type: string
 *               ledger_group_name:
 *                 type: string
 *               status_id:
 *                 type: integer
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
 *     summary: Delete a ledger group
 *     tags: [Ledger Groups]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Ledger group ID
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
 * /api/v1/ledger-groups/{id}/status:
 *   patch:
 *     summary: Update ledger group status
 *     tags: [Ledger Groups]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Ledger group ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status_id
 *             properties:
 *               status_id:
 *                 type: integer
 *                 description: Status ID (1 for active, 0 for inactive)
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Bad Request
 *       404:
 *         description: Not Found
 *       500:
 *         description: Server Error
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     LedgerGroup:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Primary key
 *         ledger_group_id:
 *           type: string
 *           description: Unique identifier for the ledger group
 *         ledger_group_name:
 *           type: string
 *           description: Name of the ledger group
 *         status_id:
 *           type: integer
 *           description: Status of the ledger group (1 for active, 0 for inactive)
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
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
