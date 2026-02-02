var express = require("express");
var assetManagementRouter = express.Router();
const assetManagementService = require("../services/assetManagementService");

/* ================= ROUTES ================= */

// Generate asset number
assetManagementRouter.get(
  "/asset-management/generate-number",
  assetManagementService.generateAssetNo
);

// Create asset management
assetManagementRouter.post(
  "/asset-management",
  assetManagementService.createAssetManagement
);

// Get all asset management
assetManagementRouter.get(
  "/asset-management",
  assetManagementService.getAllAssetManagement
);

// Get asset management by ID
assetManagementRouter.get(
  "/asset-management/:id",
  assetManagementService.getAssetManagementById
);

// Update asset management
assetManagementRouter.put(
  "/asset-management/:id",
  assetManagementService.updateAssetManagement
);

// Delete asset management
assetManagementRouter.delete(
  "/asset-management/:id",
  assetManagementService.deleteAssetManagement
);

module.exports = assetManagementRouter;
