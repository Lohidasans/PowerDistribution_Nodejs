var express = require("express");
var invoiceSettingsRouter = express.Router();
const invoiceSettingsService = require("../services/invoiceSettingsService");

invoiceSettingsRouter.post("/invoice-settings", invoiceSettingsService.create);
invoiceSettingsRouter.post(
  "/invoice-settings/bulk",
  invoiceSettingsService.bulkCreate
);
invoiceSettingsRouter.put(
  "/invoice-settings/bulk",
  invoiceSettingsService.bulkUpdate
);
invoiceSettingsRouter.get(
  "/invoice-settings",
  invoiceSettingsService.listWithRawQuery
);
invoiceSettingsRouter.get(
  "/invoice-settings/:id",
  invoiceSettingsService.getById
);
invoiceSettingsRouter.get(
  "/invoice-settings/branch/:branchId",
  invoiceSettingsService.getByBranchId
);
invoiceSettingsRouter.put(
  "/invoice-settings/:id",
  invoiceSettingsService.update
);
invoiceSettingsRouter.patch(
  "/invoice-settings/:id/status",
  invoiceSettingsService.toggleStatus
);
invoiceSettingsRouter.delete(
  "/invoice-settings/:id",
  invoiceSettingsService.remove
);

module.exports = invoiceSettingsRouter;

/**
 * @openapi
 * tags:
 *   - name: Invoice Settings
 *     description: Invoice settings management
 */
/**
 * @openapi
 * /api/v1/invoice-settings:
 *   get:
 *     summary: List invoice settings
 *     tags: [Invoice Settings]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by sequence name, prefix, or suffix
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Filter by branch ID
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoiceSettings:
 *                   type: array
 *                   items:
 *                     type: object
 *   post:
 *     summary: Create invoice setting
 *     tags: [Invoice Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               branch_id: { type: integer }
 *               sequence_name: { type: string }
 *               invoice_prefix: { type: string }
 *               invoice_suffix: { type: string }
 *               invoice_start_no: { type: integer }
 *               status_id: { type: integer, default: 1 }
 *             required: [branch_id, sequence_name]
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request - Sequence name already exists for this branch or branch not found
 */
/**
 * @openapi
 * /api/v1/invoice-settings/bulk:
 *   post:
 *     summary: Bulk create invoice settings
 *     tags: [Invoice Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               invoiceSettings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     branch_id: { type: integer }
 *                     sequence_name: { type: string }
 *                     invoice_prefix: { type: string }
 *                     invoice_suffix: { type: string }
 *                     invoice_start_no: { type: integer }
 *                     status_id: { type: integer, default: 1 }
 *                   required: [branch_id, sequence_name]
 *             required: [invoiceSettings]
 *             example:
 *               invoiceSettings:
 *                 - branch_id: 1
 *                   sequence_name: "INV_SEQUENCE_1"
 *                   invoice_prefix: "INV"
 *                   invoice_suffix: "B1"
 *                   invoice_start_no: 1000
 *                   status_id: 1
 *                 - branch_id: 1
 *                   sequence_name: "BILL_SEQUENCE_1"
 *                   invoice_prefix: "BILL"
 *                   invoice_suffix: "B1"
 *                   invoice_start_no: 2000
 *                   status_id: 1
 *     responses:
 *       201:
 *         description: Created - Invoice settings created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 invoiceSettings:
 *                   type: array
 *                   items:
 *                     type: object
       400:
         description: Bad Request - Validation errors, duplicate sequence names for same branch, or branches not found
 */
/**
 * @openapi
 * /api/v1/invoice-settings/bulk:
 *   put:
 *     summary: Bulk update invoice settings
 *     tags: [Invoice Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               invoiceSettings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     branch_id: { type: integer }
 *                     invoice_sequence_name_id: { type: string }
 *                     invoice_prefix: { type: string }
 *                     invoice_suffix: { type: string }
 *                     invoice_start_no: { type: integer }
 *                     status_id: { type: integer }
 *                   required: [id]
 *             required: [invoiceSettings]
 *             example:
 *               invoiceSettings:
 *                 - id: 1
 *                   branch_id: 1
 *                   invoice_sequence_name_id: "INV_SEQUENCE_1"
 *                   invoice_prefix: "INV_UPD"
 *                   invoice_suffix: "B1"
 *                   invoice_start_no: 1500
 *                   status_id: 1
 *                 - id: 2
 *                   branch_id: 2
 *                   invoice_sequence_name_id: "BILL_SEQUENCE_1"
 *                   invoice_prefix: "BILL_UPD"
 *                   invoice_suffix: "B2"
 *                   invoice_start_no: 2500
 *                   status_id: 1
 *     responses:
 *       200:
 *         description: OK - Invoice settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 invoiceSettings:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Bad Request - Validation errors, invoice settings not found, duplicate sequence names for same branch, or branches not found
 *       404:
 *         description: Not Found - One or more invoice settings not found
 */
/**
 * @openapi
 * /api/v1/invoice-settings/{id}:
 *   get:
 *     summary: Get invoice setting by ID
 *     tags: [Invoice Settings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 *   put:
 *     summary: Update invoice setting
 *     tags: [Invoice Settings]
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
 *               branch_id: { type: integer }
 *               sequence_name: { type: string }
 *               invoice_prefix: { type: string }
 *               invoice_suffix: { type: string }
 *               invoice_start_no: { type: integer }
 *               status_id: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Bad Request
 *       404:
 *         description: Not Found
 *   delete:
 *     summary: Delete invoice setting (soft)
 *     tags: [Invoice Settings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 *       404:
 *         description: Not Found
 */
/**
 * @openapi
 * /api/v1/invoice-settings/branch/{branchId}:
 *   get:
 *     summary: Get invoice setting by branch ID
 *     tags: [Invoice Settings]
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: integer }
 *         description: Branch ID to get invoice setting for
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoiceSetting:
 *                   type: object
 *       404:
 *         description: Invoice setting not found for this branch
 */
/**
 * @openapi
 * /api/v1/invoice-settings/{id}/status:
 *   patch:
 *     summary: Toggle invoice setting status
 *     tags: [Invoice Settings]
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
 *               status_id: { type: integer }
 *             required: [status_id]
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 */
