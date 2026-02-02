const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create Asset Management
const createAssetManagement = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const payload = req.body;

    /* ================= VALIDATION ================= */

    if (
      !payload.asset_no ||
      !payload.journal_entry_id ||
      !payload.ledger_account_id ||
      !payload.asset_name ||
      !payload.purchase_date ||
      !payload.asset_value ||
      !payload.vendor_id ||
      !payload.status_id ||
      !payload.branch_id
    ) {
      await t.rollback();
      return commonService.badRequest(
        res,
        message.asset_management?.required ||
          "asset_no, journal_entry_id, ledger_account_id, asset_name, purchase_date, asset_value, vendor_id, status_id, and branch_id are required"
      );
    }

    /* ================= CHECK DUPLICATE ================= */

    const existing = await models.AssetManagement.findOne({
      where: { asset_no: payload.asset_no },
      paranoid: false,
      transaction: t,
    });

    let assetManagement;

    if (existing) {
      if (existing.deleted_at) {
        await existing.restore({ transaction: t });
        await existing.update(payload, { transaction: t });
        assetManagement = existing;
      } else {
        await t.rollback();
        return commonService.badRequest(res, "asset_no already exists");
      }
    } else {
      assetManagement = await models.AssetManagement.create(payload, {
        transaction: t,
      });
    }

    await t.commit();

    return commonService.createdResponse(res, {
      asset_management: assetManagement,
    });
  } catch (err) {
    await t.rollback();

    if (err?.name === "SequelizeUniqueConstraintError") {
      return commonService.badRequest(res, "asset_no already exists");
    }

    return commonService.handleError(res, err);
  }
};

// Get All Asset Management
const getAllAssetManagement = async (req, res) => {
  try {
    const {
      search,
      branch_id,
      vendor_id,
      status_id,
      department_id,
      date_from,
      date_to,
    } = req.query;

    let query = `
      SELECT
        am.*,
        b.branch_name,
        v.vendor_name,
        l.ledger_name as ledger_account_name,
        je.journal_no,
        ed.department_name
      FROM asset_management am
      LEFT JOIN branches b ON am.branch_id = b.id
      LEFT JOIN vendors v ON am.vendor_id = v.id
      LEFT JOIN ledger l ON am.ledger_account_id = l.id
      LEFT JOIN journal_entries je ON am.journal_entry_id = je.id
      LEFT JOIN employee_departments ed ON am.department_id = ed.id
      WHERE am.deleted_at IS NULL
    `;
    const replacements = {};

    if (search) {
      query += ` AND (am.asset_no LIKE :search OR am.asset_name LIKE :search OR am.serial_no LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    if (branch_id) {
      query += ` AND am.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    if (vendor_id) {
      query += ` AND am.vendor_id = :vendor_id`;
      replacements.vendor_id = vendor_id;
    }

    if (status_id) {
      query += ` AND am.status_id = :status_id`;
      replacements.status_id = status_id;
    }

    if (department_id) {
      query += ` AND am.department_id = :department_id`;
      replacements.department_id = department_id;
    }

    if (date_from) {
      query += ` AND am.purchase_date >= :date_from`;
      replacements.date_from = date_from;
    }

    if (date_to) {
      query += ` AND am.purchase_date <= :date_to`;
      replacements.date_to = date_to;
    }

    query += ` ORDER BY am.purchase_date DESC, am.id DESC`;

    const assetManagement = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      replacements,
    });

    return commonService.okResponse(res, assetManagement);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Asset Management by ID
const getAssetManagementById = async (req, res) => {
  try {
    const { id } = req.params;

    const assetManagement = await models.AssetManagement.findByPk(id);

    if (!assetManagement) {
      return commonService.notFound(res, "Asset Management not found");
    }

    // Get maintenance history for this asset
    const maintenanceHistory = await models.MaintenanceHistory.findAll({
      where: { asset_management_id: id },
      order: [["date", "DESC"]],
    });

    return commonService.okResponse(res, {
      asset_management: assetManagement,
      maintenance_history: maintenanceHistory,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update Asset Management
const updateAssetManagement = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const payload = req.body;

    const assetManagement = await models.AssetManagement.findByPk(id, {
      transaction: t,
    });

    if (!assetManagement) {
      await t.rollback();
      return commonService.notFound(res, "Asset Management not found");
    }

    await assetManagement.update(payload, { transaction: t });

    await t.commit();

    return commonService.okResponse(res, {
      asset_management: assetManagement,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Delete Asset Management
const deleteAssetManagement = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const assetManagement = await models.AssetManagement.findByPk(id, {
      transaction: t,
    });

    if (!assetManagement) {
      await t.rollback();
      return commonService.notFound(res, "Asset Management not found");
    }

    await assetManagement.destroy({ transaction: t });

    await t.commit();

    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Generate Asset Number
const generateAssetNo = async (req, res) => {
  try {
    const asset_no = await generateFiscalSeriesCode(
      models.AssetManagement,
      "asset_no",
      "AST",
      { pad: 4 }
    );

    return commonService.okResponse(res, { asset_no });
  } catch (err) {
    console.error("Error generating asset number:", err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createAssetManagement,
  getAllAssetManagement,
  getAssetManagementById,
  updateAssetManagement,
  deleteAssetManagement,
  generateAssetNo,
};
