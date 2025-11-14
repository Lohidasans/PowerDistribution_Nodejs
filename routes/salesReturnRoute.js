const express = require('express');
const router = express.Router();
const svc = require("../services/salesReturnService");

router.post('/sales-returns/code', svc.generateSalesReturnNo);
router.post('/sales-returns', svc.createSalesReturn);
router.get('/sales-returns/:id',  svc.getSalesReturnById);
router.get('/sales-returns', svc.listSalesReturns);
router.delete('/sales-returns/:id', svc.deleteSalesReturn);

module.exports = router;
