var express = require("express");
var roleRouter = express.Router();
const svc = require("../services/reportService");

roleRouter.get("/report/sales-invoice", svc.getSalesInvoiceReport);
roleRouter.get("/report/sales-return", svc.getSalesReturnReport);
roleRouter.get("/report/old-jewel", svc.getOldJewelReport);
roleRouter.get("/report/jewel-repair", svc.getJewelRepairReport);

module.exports = roleRouter;