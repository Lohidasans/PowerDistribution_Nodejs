var express = require("express");
var router = express.Router();
const svc = require("../services/codeGeneratorService");

router.get("/code-generator", svc.generateCode);
router.get("/code-generator/invoice-types", svc.getInvoiceTypes)

module.exports = router;