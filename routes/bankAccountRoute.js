var express = require("express");
var router = express.Router();
const svc = require("../services/bankAccountService");

// CRUD
router.post("/bank-account", svc.createBankAccount);
router.get("/bank-account", svc.listBankAccounts);
router.get("/bank-account/:id", svc.getBankAccountById);
router.put("/bank-account/:id", svc.updateBankAccount);
router.delete("/bank-account/:id", svc.deleteBankAccount);

module.exports = router;


/**
 * @openapi
 * tags:
 *   - name: BankAccount
 *     description: Bank account management
 */
/**
 * @openapi
 * /api/v1/bank-account:
 *   get:
 *     summary: List bank accounts
 *     tags: [BankAccount]
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
 *     summary: Create bank account
 *     tags: [BankAccount]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BankAccountInput'
 *           example:
 *             account_holder_name: "HKM Silver"
 *             bank_name: "State Bank of India"
 *             ifsc_code: "SBIN00016859"
 *             account_number: "9945989656230"
 *             bank_branch_name: "Avadi"
 *             entity_type: "branch"
 *             entity_id: 1
 *     responses:
 *       201:
 *         description: Created
 */
/**
 * @openapi
 * /api/v1/bank-account/{id}:
 *   get:
 *     summary: Get bank account by ID
 *     tags: [BankAccount]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update bank account
 *     tags: [BankAccount]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BankAccountInput'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete bank account (soft)
 *     tags: [BankAccount]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
