const Sequelize = require("sequelize");
const { sequelize } = require("../config/dbConfig");
const Holiday = require("./holidays")(sequelize, Sequelize.DataTypes);

const Country = require("./country")(sequelize, Sequelize.DataTypes);
const State = require("./state")(sequelize, Sequelize.DataTypes);
const District = require("./districts")(sequelize, Sequelize.DataTypes);

const Customer = require("./customer")(sequelize, Sequelize.DataTypes);
const Permission = require("./permissions")(sequelize, Sequelize.DataTypes);
const Role = require("./roles")(sequelize, Sequelize.DataTypes);
const ModuleGroup = require("./moduleGroups")(sequelize, Sequelize.DataTypes);
const Module = require("./modules")(sequelize, Sequelize.DataTypes);
const AccessLevel = require("./access_levels")(sequelize, Sequelize.DataTypes);
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
const Enrollment = require("./customer_enrollments")(sequelize, Sequelize.DataTypes);

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
const EmployeePermission = require("./employeePermissions")(
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
const ProductVariant = require("./productVariants")(sequelize, Sequelize.DataTypes);

// GRN related models
const Grn = require("./grns")(sequelize, Sequelize.DataTypes);
const GrnItem = require("./grnItems")(sequelize, Sequelize.DataTypes);
const ProductGrnInfo = require("./productGrnInfos")(sequelize, Sequelize.DataTypes);
const Purity = require("./purities")(sequelize, Sequelize.DataTypes);

// Purchase Order related models
const PurchaseOrder = require("./purchaseOrders")(sequelize, Sequelize.DataTypes);
const PurchaseOrderItem = require("./purchaseOrderItems")(sequelize, Sequelize.DataTypes);

// Purchase Return related models
const PurchaseReturn = require("./purchaseReturns")(sequelize, Sequelize.DataTypes);
const PurchaseReturnItem = require("./purchaseReturnItems")(sequelize, Sequelize.DataTypes);

// Ledger related models
const LedgerGroup = require("./ledgerGroup")(sequelize, Sequelize.DataTypes);
const Ledger = require("./ledger")(sequelize, Sequelize.DataTypes);

// Billing related models
const EstimateBill = require("./estimateBills")(sequelize, Sequelize.DataTypes);
const EstimateBillItem = require("./estimateBillItems")(sequelize, Sequelize.DataTypes);
const SalesInvoiceBill = require("./salesInvoiceBills")(sequelize, Sequelize.DataTypes);
const SalesInvoiceBillItem = require("./SalesInvoiceBillItems")(sequelize, Sequelize.DataTypes);
const SalesInvoiceAdjustment = require("./salesInvoiceAdjustments")(sequelize, Sequelize.DataTypes);
const Payment = require("./payments")(sequelize, Sequelize.DataTypes);
const BillAdjustmentType = require("./billAdjustmentTypes")(sequelize, Sequelize.DataTypes);
const OldJewel = require("./oldJewels")(sequelize, Sequelize.DataTypes);
const OldJewelItem = require("./oldJewelItems")(sequelize, Sequelize.DataTypes);
const SalesReturn = require("./salesReturns")(sequelize, Sequelize.DataTypes);
const SalesReturnItem = require("./salesReturnItems")(sequelize, Sequelize.DataTypes);
const JewelRepair = require("./jewelRepairs")(sequelize, Sequelize.DataTypes);
const JewelRepairItem = require("./jewelRepairItems")(sequelize, Sequelize.DataTypes);

// Quotation related models
const Quotation = require("./quotations")(sequelize, Sequelize.DataTypes);
const QuotationItem = require("./quotationItems")(sequelize, Sequelize.DataTypes);

// Leave related models
const LeaveType = require("./leaveTypes")(sequelize, Sequelize.DataTypes);
const Leave = require("./leave")(sequelize, Sequelize.DataTypes);

const SuperAdminProfile = require("./superAdminProfiles")(sequelize, Sequelize.DataTypes);
const InvoiceSettingEnum = require("./invoiceSettingEnum")(sequelize, Sequelize.DataTypes);


// Stock Management related models
const StockTransfer = require("./stockTransfers")(sequelize, Sequelize.DataTypes);
const StockTransferItem = require("./stockTransferItems")(sequelize, Sequelize.DataTypes);
const StockTransferTracking = require("./stockTransferTrackings")(sequelize, Sequelize.DataTypes);
const StockTransferStatusHistory = require("./stockTransferStatusHistories")(sequelize, Sequelize.DataTypes);

// Vendor Payment models
const BillType = require("./billTypes")(sequelize, Sequelize.DataTypes);
const PaymentMode = require("./paymentModes")(sequelize, Sequelize.DataTypes);
const VendorPayment = require("./vendorPayments")(sequelize, Sequelize.DataTypes);

// Order Related models
const Order = require("./orders")(sequelize, Sequelize.DataTypes);
const OrderItem = require("./orderItems")(sequelize, Sequelize.DataTypes);
const CartWishlistItem = require("./cartWishlistItems")(sequelize, Sequelize.DataTypes);
const CustomerAddress = require("./customerAddresses")(sequelize, Sequelize.DataTypes);

// Offer Related models
const OfferPlan = require("./offerPlans")(sequelize, Sequelize.DataTypes);
const OfferApplicableType = require("./offerApplicableTypes")(sequelize, Sequelize.DataTypes);
const Offer = require("./offers")(sequelize, Sequelize.DataTypes);

// Assest Management related models
const Maintenance = require("./maintenances")(sequelize, Sequelize.DataTypes);
const MaintenanceType = require("./maintenanceTypes")(sequelize, Sequelize.DataTypes);

const models = {
  Permission,
  Role,
  RolePermission,
  ModuleGroup,
  Module,
  AccessLevel,
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
  ProductGrnInfo,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseReturn,
  PurchaseReturnItem,
  ProductItemDetail,
  ProductAdditionalDetail,
  ProductAddOn,
  ProductVariant,
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
  SalesInvoiceBill,
  SalesInvoiceBillItem,
  EstimateBill,
  EstimateBillItem,
  Payment,
  Quotation,
  QuotationItem,
  LeaveType,
  Leave,
  Holiday,
  SalesInvoiceAdjustment,
  BillAdjustmentType,
  OldJewel,
  OldJewelItem,
  SalesReturn,
  SalesReturnItem,
  JewelRepair,
  JewelRepairItem,
  StockTransfer,
  StockTransferItem,
  StockTransferTracking,
  StockTransferStatusHistory,
  BillType,
  PaymentMode,
  VendorPayment,
  EmployeePermission,
  Order, 
  OrderItem,
  CartWishlistItem,
  CustomerAddress,
  Purity,
  OfferPlan,
  OfferApplicableType,
  Offer,
  Maintenance,
  MaintenanceType
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
