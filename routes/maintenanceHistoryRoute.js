var express = require("express");
var maintenanceHistoryRouter = express.Router();
const maintenanceHistoryService = require("../services/maintenanceHistoryService");

/* ================= ROUTES ================= */

// Create maintenance history
maintenanceHistoryRouter.post(
  "/maintenance-history",
  maintenanceHistoryService.createMaintenanceHistory
);

// Get all maintenance history
maintenanceHistoryRouter.get(
  "/maintenance-history",
  maintenanceHistoryService.getAllMaintenanceHistory
);

// Get maintenance history by asset ID
maintenanceHistoryRouter.get(
  "/maintenance-history/asset/:asset_id",
  maintenanceHistoryService.getMaintenanceHistoryByAssetId
);

// Get maintenance history by ID
maintenanceHistoryRouter.get(
  "/maintenance-history/:id",
  maintenanceHistoryService.getMaintenanceHistoryById
);

// Update maintenance history
maintenanceHistoryRouter.put(
  "/maintenance-history/:id",
  maintenanceHistoryService.updateMaintenanceHistory
);

// Delete maintenance history
maintenanceHistoryRouter.delete(
  "/maintenance-history/:id",
  maintenanceHistoryService.deleteMaintenanceHistory
);

module.exports = maintenanceHistoryRouter;
