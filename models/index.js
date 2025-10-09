const Sequelize = require('sequelize');
const { sequelize } = require('../config/dbConfig');

const Permission = require('./permissions')(sequelize, Sequelize.DataTypes);
const Role = require('./roles')(sequelize, Sequelize.DataTypes);
const RolePermission = require('./rolePermissions')(sequelize, Sequelize.DataTypes);

// Branch related models
const Branch = require('./branches')(sequelize, Sequelize.DataTypes);
const BankAccount = require('./bankAccounts')(sequelize, Sequelize.DataTypes);
const KycDocument = require('./kycDocuments')(sequelize, Sequelize.DataTypes);
const InvoiceSetting = require('./invoiceSettings')(sequelize, Sequelize.DataTypes);
const User = require('./users')(sequelize, Sequelize.DataTypes);

// Vendor related models
const Vendor = require('./vendors')(sequelize, Sequelize.DataTypes);
const VendorSPOCDetails = require('./vendorSpocDetails')(sequelize, Sequelize.DataTypes);

// Employee related models
const Employee = require('./employees')(sequelize, Sequelize.DataTypes);
const EmployeeContact = require('./employeeContacts')(sequelize, Sequelize.DataTypes);
const EmployeeExperience = require('./employeeExperiences')(sequelize, Sequelize.DataTypes);
const EmployeeIncentive = require('./employeeIncentives')(sequelize, Sequelize.DataTypes);

//Collection and UOM related modes
const MaterialType = require('./materialType')(sequelize, Sequelize.DataTypes);
const Category = require('./categories')(sequelize, Sequelize.DataTypes);
const Subcategory = require('./subcategories')(sequelize, Sequelize.DataTypes);
const Variant = require('./variants')(sequelize, Sequelize.DataTypes);
const VariantValue = require('./variantValues')(sequelize, Sequelize.DataTypes);
const Uom = require('./uom')(sequelize, Sequelize.DataTypes);



const models = {
  Permission,
  Role,
  RolePermission,
  Branch,
  BankAccount,
  KycDocument,
  InvoiceSetting,
  User,
  Vendor,
  VendorSPOCDetails,
  Employee,
  EmployeeContact,
  EmployeeExperience,
  EmployeeIncentive,
  MaterialType,
  Category,
  Subcategory,
  Variant,
  VariantValue,
  Uom,
};

Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

(async () => {
  try {
    await sequelize.sync();
    console.log("Models synchronized successfully!.");
  } catch (error) {
    console.error("Unable to sync database:", error);
  }
})();

module.exports = { sequelize, models }; 
