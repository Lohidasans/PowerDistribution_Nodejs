var express = require("express");
var router = express.Router();
const svc = require("../services/customerSchemePaymentService");

// CRUD
router.post("/customer-scheme-payment", svc.createSchemePayment);
router.post("/customer-scheme-payment/close", svc.closeEnrollment);


module.exports = router;