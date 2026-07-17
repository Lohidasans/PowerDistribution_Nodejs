var express = require("express");
var router = express.Router();
const svc = require("../services/customerSchemePaymentService");

// CRUD
router.post("/customer-scheme-payment", svc.createSchemePayment);
router.post("/customer-scheme-payment/close", svc.closeEnrollment);
router.get("/admin/customer-scheme-payments", svc.listSchemeEnrollmentsForAdmin);// Same can be used for enrollment and scheme gets
router.get("/customer-saving-schemes/web", svc.listCustomerSavingSchemes);


module.exports = router;