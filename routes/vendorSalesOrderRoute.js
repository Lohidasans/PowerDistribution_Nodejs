var express = require("express");
var vendorRouter = express.Router();
const vendorSalesOrderService = require("../services/vendorSalesOrderService");

// CRUD
vendorRouter.get("/vendor/sales-orders", vendorSalesOrderService.listVendorSalesOrders);
vendorRouter.get("/vendor/sales-orders/charge-types", vendorSalesOrderService.getChargeTypeDropdown);
vendorRouter.get("/vendor/sales-orders/:id", vendorSalesOrderService.getVendorSalesOrderById);
vendorRouter.put("/vendor/sales-orders/:id", vendorSalesOrderService.submitVendorSalesOrder);
vendorRouter.put("/vendor/sales-orders/:id/status", vendorSalesOrderService.rejectVendorSalesOrder);
//vendorRouter.put("/vendor/sales-orders/:id/status", vendorSalesOrderService.updateVendorSalesOrderStatus);  // accept or reject


module.exports = vendorRouter;