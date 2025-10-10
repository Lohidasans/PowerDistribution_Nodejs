const RoleRouter = require('./roleRoute');
const RolePermissionRouter = require('./rolesPermissionRoute');
const BranchRouter = require('./branchRoute');

module.exports = (app) => {
    app.use("/api/v1", RoleRouter);
    app.use("/api/v1", RolePermissionRouter);
    app.use("/api/v1", BranchRouter);
}