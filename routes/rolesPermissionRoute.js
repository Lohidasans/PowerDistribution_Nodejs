var express = require("express");
var rolesPermissionRouter = express.Router();
const rolesPermissionService = require("../services/rolesPermissionService");

rolesPermissionRouter.post("/role-permissions", rolesPermissionService.createRolePermissionsBulk);
rolesPermissionRouter.put("/role-permissions/:id", rolesPermissionService.updateRolePermissionsBulk);
rolesPermissionRouter.get("/role-permissions/list-details", rolesPermissionService.listAccess);
rolesPermissionRouter.delete("/listPermissionsWithRoles/:role_id", rolesPermissionService.deleteRolePermissions);

module.exports = rolesPermissionRouter;