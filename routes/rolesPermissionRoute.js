var express = require("express");
var rolesPermissionRouter = express.Router();
const rolesPermissionService = require("../services/rolesPermissionService");

rolesPermissionRouter.post("/rolesPermission", rolesPermissionService.create);
rolesPermissionRouter.get("/listPermissionsByRole/:role_id", rolesPermissionService.listByRole);
rolesPermissionRouter.get("/rolesPermission/:id", rolesPermissionService.getById);
rolesPermissionRouter.get("/listPermissionsWithRoles", rolesPermissionService.listPermissionsWithRoles);

module.exports = rolesPermissionRouter;