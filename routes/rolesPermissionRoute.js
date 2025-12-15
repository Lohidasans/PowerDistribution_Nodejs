var express = require("express");
var rolesPermissionRouter = express.Router();
const rolesPermissionService = require("../services/rolesPermissionService");

rolesPermissionRouter.post("/role-permissions", rolesPermissionService.createRolePermissionsBulk);
rolesPermissionRouter.put("/role-permissions", rolesPermissionService.updateRolePermissionsBulk);
rolesPermissionRouter.get("/role-permissions", rolesPermissionService.getRolePermissions);
rolesPermissionRouter.get("/role-permissions/list-details", rolesPermissionService.listAccess);
rolesPermissionRouter.get("/role-permissions/:id", rolesPermissionService.getRolePermissionById);
rolesPermissionRouter.delete("/listPermissionsWithRoles/:role_id", rolesPermissionService.deleteRolePermissions);

module.exports = rolesPermissionRouter;