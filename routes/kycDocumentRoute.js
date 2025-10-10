/**
 * @openapi
 * tags:
 *   - name: KycDocument
 *     description: KYC document management
 */
var express = require("express");
var router = express.Router();
const svc = require("../services/kycDocumentService");

// CRUD
router.post("/kyc-document", svc.createKycDocument);
router.get("/kyc-document", svc.listKycDocuments);
router.get("/kyc-document/:id", svc.getKycDocumentById);
router.put("/kyc-document/:id", svc.updateKycDocument);
router.delete("/kyc-document/:id", svc.deleteKycDocument);

module.exports = router;

/**
 * @openapi
 * /api/v1/kyc-document:
 *   get:
 *     summary: List KYC documents
 *     tags: [KycDocument]
 *     parameters:
 *       - in: query
 *         name: entity_type
 *         schema: { type: string, enum: [branch, vendor, employee] }
 *       - in: query
 *         name: entity_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create KYC document
 *     tags: [KycDocument]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KycDocumentInput'
 *     responses:
 *       201:
 *         description: Created
 */
/**
 * @openapi
 * /api/v1/kyc-document/{id}:
 *   get:
 *     summary: Get KYC document by ID
 *     tags: [KycDocument]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update KYC document
 *     tags: [KycDocument]
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
 *             $ref: '#/components/schemas/KycDocumentInput'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete KYC document (soft)
 *     tags: [KycDocument]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
