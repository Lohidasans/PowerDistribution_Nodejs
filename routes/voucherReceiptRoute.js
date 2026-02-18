var express = require("express");
var router = express.Router();
const svc = require("../services/voucherReceiptService");

// CRUD
router.post("/voucher-receipts", svc.createVoucherReceipt);
router.post("/voucher-receipts/code", svc.generateReceiptNumber);
router.get("/voucher-receipts", svc.getVoucherReceipts);
router.get("/voucher-receipts/:id", svc.getVoucherReceiptById);
router.put("/voucher-receipts/:id", svc.updateVoucherReceipt);
router.put("/voucher-receipts/:id/activate-deactivate", svc.activateDeactivateReceipt);
router.delete("/voucher-receipts/:id", svc.deleteVoucherReceipt);

module.exports = router;
