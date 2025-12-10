var express = require("express");
var moduleRouter = express.Router();
const moduleService = require("../services/moduleService");

moduleRouter.get("/modules/:moduleGroupId", moduleService.getModulesByGroupId);

module.exports = moduleRouter;