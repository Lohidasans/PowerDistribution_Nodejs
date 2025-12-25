const express = require('express');
const router = express.Router();
const svc = require("../services/salesReturnService");

router.post('/sales-returns/code', svc.generateSalesReturnNo);
router.post('/sales-returns', svc.createSalesReturn);
router.put('/sales-returns/:id', svc.updateSalesReturn);
router.get('/sales-returns', svc.listSalesReturns);
router.get("/sales-returns/dropdown", svc.listSalesReturnDropdown);
router.get('/sales-returns/:id', svc.getSalesReturnById);
router.delete('/sales-returns/:id', svc.deleteSalesReturn);

module.exports = router;
