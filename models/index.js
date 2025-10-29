const Sequelize = require("sequelize");
const { sequelize } = require("../config/dbConfig");

const Country = require("./country")(sequelize, Sequelize.DataTypes);
const State = require("./state")(sequelize, Sequelize.DataTypes);
const District = require("./districts")(sequelize, Sequelize.DataTypes);

const Customer = require("./customer")(sequelize, Sequelize.DataTypes);
const Permission = require("./permissions")(sequelize, Sequelize.DataTypes);
const Role = require("./roles")(sequelize, Sequelize.DataTypes);
const RolePermission = require("./rolePermissions")(
  sequelize,
  Sequelize.DataTypes
);
const Scheme = require("./schemes")(sequelize, Sequelize.DataTypes);
const SchemeType = require("./schemeTypes")(sequelize, Sequelize.DataTypes);
const SchemeDuration = require("./schemeDurations")(sequelize, Sequelize.DataTypes);
const PaymentFrequency = require("./paymentFrequencies")(sequelize, Sequelize.DataTypes);
const RedemptionType = require("./redemptionTypes")(sequelize, Sequelize.DataTypes);
const IdentityProof = require("./identityProofs")(sequelize, Sequelize.DataTypes);
const NomineeRelation = require("./nomineeRelations")(sequelize, Sequelize.DataTypes);
const Enrollment = require("./enrollments")(sequelize, Sequelize.DataTypes);

// Branch related models
const Branch = require("./branches")(sequelize, Sequelize.DataTypes);
const BankAccount = require("./bankAccounts")(sequelize, Sequelize.DataTypes);
const KycDocument = require("./kycDocuments")(sequelize, Sequelize.DataTypes);
const InvoiceSetting = require("./invoiceSettings")(
  sequelize,
  Sequelize.DataTypes
);
const User = require("./users")(sequelize, Sequelize.DataTypes);

// Vendor related models
const Vendor = require("./vendors")(sequelize, Sequelize.DataTypes);
const VendorSpocDetails = require("./vendorSpocDetails")(
  sequelize,
  Sequelize.DataTypes
);

// Employee related models
const Employee = require("./employees")(sequelize, Sequelize.DataTypes);
const EmployeeContact = require("./employeeContacts")(
  sequelize,
  Sequelize.DataTypes
);
const EmployeeExperience = require("./employeeExperiences")(
  sequelize,
  Sequelize.DataTypes
);
const EmployeeIncentive = require("./employeeIncentives")(
  sequelize,
  Sequelize.DataTypes
);
const EmployeeDepartment = require("./employeeDepartments")(
  sequelize,
  Sequelize.DataTypes
);
const EmployeeDesignation = require("./employeeDesignations")(
  sequelize,
  Sequelize.DataTypes
);

//Collection and UOM related modes
const MaterialType = require("./materialTypes")(sequelize, Sequelize.DataTypes);
const Category = require("./categories")(sequelize, Sequelize.DataTypes);
const Subcategory = require("./subcategories")(sequelize, Sequelize.DataTypes);
const Variant = require("./variants")(sequelize, Sequelize.DataTypes);
const VariantValue = require("./variantValues")(sequelize, Sequelize.DataTypes);
const Uom = require("./uom")(sequelize, Sequelize.DataTypes);

// Products related models
const Product = require("./products")(sequelize, Sequelize.DataTypes);
const ProductItemDetail = require("./productItemDetails")(
  sequelize,
  Sequelize.DataTypes
);
const ProductAdditionalDetail = require("./productAdditionalDetails")(
  sequelize,
  Sequelize.DataTypes
);
const ProductAddOn = require("./productAddOns")(sequelize, Sequelize.DataTypes);

// GRN related models
const Grn = require("./grns")(sequelize, Sequelize.DataTypes);
const GrnItem = require("./grnItems")(sequelize, Sequelize.DataTypes);

// Ledger related models
const LedgerGroup = require("./ledgerGroup")(sequelize, Sequelize.DataTypes);
const Ledger = require("./ledger")(sequelize, Sequelize.DataTypes);

const SuperAdminProfile = require("./superAdminProfiles")(
  sequelize,
  Sequelize.DataTypes
);
const InvoiceSettingEnum = require("./invoiceSettingEnum")(
  sequelize,
  Sequelize.DataTypes
);
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
  VendorSpocDetails,
  Employee,
  EmployeeContact,
  EmployeeExperience,
  EmployeeIncentive,
  EmployeeDepartment,
  EmployeeDesignation,
  MaterialType,
  Category,
  Subcategory,
  Variant,
  VariantValue,
  Uom,
  Product,
  Grn,
  GrnItem,
  ProductItemDetail,
  ProductAdditionalDetail,
  ProductAddOn,
  Country,
  State,
  District,
  Customer,
  LedgerGroup,
  Ledger,
  Scheme,
  SchemeType,
  SchemeDuration,
  PaymentFrequency,
  RedemptionType,
  IdentityProof,
  NomineeRelation,
  Enrollment,
  SuperAdminProfile,
  InvoiceSettingEnum,
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
