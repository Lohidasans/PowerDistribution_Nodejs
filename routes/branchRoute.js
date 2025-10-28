var express = require("express");
var branchRouter = express.Router();
const branchService = require("../services/branchService");

branchRouter.post("/branch", branchService.createBranch);
branchRouter.get("/branch", branchService.listBranches);
branchRouter.get("/branch/dropdown", branchService.branchDropdownList);
branchRouter.get("/branch/:id", branchService.getBranchById);
branchRouter.put("/branch/:id", branchService.updateBranch);
branchRouter.delete("/branch/:id", branchService.deleteBranch);
branchRouter.post("/branch/code", branchService.generateBranchCode); 

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
