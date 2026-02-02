const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");

// Create Maintenance History
const createMaintenanceHistory = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const payload = req.body;

    /* ================= VALIDATION ================= */

    if (
      !payload.date ||
      !payload.asset_management_id ||
      !payload.maintenance_type_id
    ) {
      await t.rollback();
      return commonService.badRequest(
        res,
        message.maintenance_history?.required ||
          "date, asset_management_id, and maintenance_type_id are required"
      );
    }

    // Check if asset exists
    const asset = await models.AssetManagement.findByPk(
      payload.asset_management_id,
      { transaction: t }
    );

    if (!asset) {
      await t.rollback();
      return commonService.badRequest(res, "Asset Management not found");
    }

    const maintenanceHistory = await models.MaintenanceHistory.create(
      payload,
      { transaction: t }
    );

    await t.commit();

    return commonService.createdResponse(res, {
      maintenance_history: maintenanceHistory,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Get All Maintenance History
const getAllMaintenanceHistory = async (req, res) => {
  try {
    const {
      asset_management_id,
      maintenance_type_id,
      date_from,
      date_to,
      search,
    } = req.query;

    let query = `
      SELECT
        mh.*,
        am.asset_no,
        am.asset_name,
        mt.maintenance_type_name
      FROM maintenance_history mh
      LEFT JOIN asset_management am ON mh.asset_management_id = am.id
      LEFT JOIN maintenance_types mt ON mh.maintenance_type_id = mt.id
      WHERE mh.deleted_at IS NULL
    `;
    const replacements = {};

    if (asset_management_id) {
      query += ` AND mh.asset_management_id = :asset_management_id`;
      replacements.asset_management_id = asset_management_id;
    }

    if (maintenance_type_id) {
      query += ` AND mh.maintenance_type_id = :maintenance_type_id`;
      replacements.maintenance_type_id = maintenance_type_id;
    }

    if (search) {
      query += ` AND (am.asset_no LIKE :search OR am.asset_name LIKE :search OR mh.technician_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    if (date_from) {
      query += ` AND mh.date >= :date_from`;
      replacements.date_from = date_from;
    }

    if (date_to) {
      query += ` AND mh.date <= :date_to`;
      replacements.date_to = date_to;
    }

    query += ` ORDER BY mh.date DESC, mh.id DESC`;

    const maintenanceHistory = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      replacements,
    });

    return commonService.okResponse(res, maintenanceHistory);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Maintenance History by ID
const getMaintenanceHistoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const maintenanceHistory = await models.MaintenanceHistory.findByPk(id);

    if (!maintenanceHistory) {
      return commonService.notFound(res, "Maintenance History not found");
    }

    return commonService.okResponse(res, {
      maintenance_history: maintenanceHistory,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update Maintenance History
const updateMaintenanceHistory = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const payload = req.body;

    const maintenanceHistory = await models.MaintenanceHistory.findByPk(id, {
      transaction: t,
    });

    if (!maintenanceHistory) {
      await t.rollback();
      return commonService.notFound(res, "Maintenance History not found");
    }

    await maintenanceHistory.update(payload, { transaction: t });

    await t.commit();

    return commonService.okResponse(res, {
      maintenance_history: maintenanceHistory,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Delete Maintenance History
const deleteMaintenanceHistory = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const maintenanceHistory = await models.MaintenanceHistory.findByPk(id, {
      transaction: t,
    });

    if (!maintenanceHistory) {
      await t.rollback();
      return commonService.notFound(res, "Maintenance History not found");
    }

    await maintenanceHistory.destroy({ transaction: t });

    await t.commit();

    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Get Maintenance History by Asset ID
const getMaintenanceHistoryByAssetId = async (req, res) => {
  try {
    const { asset_id } = req.params;

    const maintenanceHistory = await models.MaintenanceHistory.findAll({
      where: { asset_management_id: asset_id },
      order: [["date", "DESC"]],
    });

    return commonService.okResponse(res, maintenanceHistory);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createMaintenanceHistory,
  getAllMaintenanceHistory,
  getMaintenanceHistoryById,
  updateMaintenanceHistory,
  deleteMaintenanceHistory,
  getMaintenanceHistoryByAssetId,
};
