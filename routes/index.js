const RoleRouter = require('./roleRoute');
const RolePermissionRouter = require('./rolesPermissionRoute');
const BranchRouter = require('./branchRoute');
const BankAccountRouter = require('./bankAccountRoute');
const KycDocumentRouter = require('./kycDocumentRoute');

module.exports = (app) => {
    app.use("/api/v1", RoleRouter);
    app.use("/api/v1", RolePermissionRouter);
    app.use("/api/v1", BranchRouter);
    app.use("/api/v1", BankAccountRouter);
    app.use("/api/v1", KycDocumentRouter);
}