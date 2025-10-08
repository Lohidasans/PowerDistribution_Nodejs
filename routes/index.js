const RoleRouter = require('./roleRoute');
const RolePermissionRouter = require('./rolesPermissionRoute');

module.exports = (app) => {
    app.use("/api/v1", RoleRouter);
    app.use("/api/v1", RolePermissionRouter);
}