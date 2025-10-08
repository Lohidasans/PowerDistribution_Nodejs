var express = require("express");
var roleRouter = express.Router();
const roleService = require("../services/rolesService");

roleRouter.post("/role", roleService.create);
roleRouter.get("/role", roleService.list);
roleRouter.get("/role/:id", roleService.getById);
roleRouter.put("/role/:id", roleService.update);
roleRouter.delete("/role/:id", roleService.remove);

module.exports = roleRouter;