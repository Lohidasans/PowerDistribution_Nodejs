var express = require("express");
var tagPrintSettingRouter = express.Router();
const tagPrintSettingService = require("../services/tagPrintSettingService");

tagPrintSettingRouter.get("/tag-print-settings", tagPrintSettingService.getSettings);
tagPrintSettingRouter.post("/tag-print-settings", tagPrintSettingService.saveSettings);
tagPrintSettingRouter.put("/tag-print-settings", tagPrintSettingService.saveSettings);

module.exports = tagPrintSettingRouter;
