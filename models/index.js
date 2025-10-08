const Sequelize = require('sequelize');
const { sequelize } = require('../config/dbConfig');

const Permission = require('./permissions')(sequelize, Sequelize.DataTypes);
const Role = require('./roles')(sequelize, Sequelize.DataTypes);
const RolePermission = require('./rolePermissions')(sequelize, Sequelize.DataTypes);

// Branch related models
const Branch = require('./branches')(sequelize, Sequelize.DataTypes);
const BankAccount = require('./bankAccounts')(sequelize, Sequelize.DataTypes);
const KycDocument = require('./KycDocuments')(sequelize, Sequelize.DataTypes);
const InvoiceSetting = require('./invoiceSettings')(sequelize, Sequelize.DataTypes);
const User = require('./users')(sequelize, Sequelize.DataTypes);
const UserRole = require('./userRoles')(sequelize, Sequelize.DataTypes);

// Vendor related models
const Vendor = require('./vendors')(sequelize, Sequelize.DataTypes);
const VendorSPOCDetails = require('./vendorSpocDetails')(sequelize, Sequelize.DataTypes);

// Employee related models
const Employee = require('./employees')(sequelize, Sequelize.DataTypes);
const EmployeeContact = require('./employeeContacts')(sequelize, Sequelize.DataTypes);
const EmployeeExperience = require('./employeeExperiences')(sequelize, Sequelize.DataTypes);

const models = {
  Permission,
  Role,
  RolePermission,
  Branch,
  BankAccount,
  KycDocument,
  InvoiceSetting,
  User,
  UserRole,
  Vendor,
  VendorSPOCDetails,
  Employee,
  EmployeeContact,
  EmployeeExperience,
};

Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

// Many-to-many between Users and Roles through UserRole
if (User && Role) {
  User.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id', otherKey: 'role_id', as: 'roles' });
  Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id', otherKey: 'user_id', as: 'users' });
}

(async () => {
  try {
    await sequelize.sync();
    console.log("Models synchronized successfully!.");
  } catch (error) {
    console.error("Unable to sync database:", error);
  }
})();

module.exports = { sequelize, models }; 
