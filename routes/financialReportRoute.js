var express = require("express");
var router = express.Router();
const svc = require("../services/financialReportService");

router.get("/financial-report/trial-balance",  svc.getTrialBalance);
router.get("/financial-report/profit-loss",    svc.getProfitLoss);
router.get("/financial-report/balance-sheet",  svc.getBalanceSheet);
router.get("/financial-report/gstr1",          svc.getGstr1);
router.get("/financial-report/gstr1-portal",   svc.getGstr1Portal);

module.exports = router;
