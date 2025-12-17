var express = require("express");
var router = express.Router();
const svc = require("../services/employeePermissionService");

router.get("/employee-permissions", svc.getEmployeePermissionsWithRole);
router.put("/employee-permissions/:employee_id", svc.updateEmployeePermissions);

module.exports = router;
