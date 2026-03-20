var express = require("express");
var roleRouter = express.Router();
const svc = require("../services/reportService");

roleRouter.get("/report/sales-invoice", svc.getSalesInvoiceReport);

module.exports = roleRouter;