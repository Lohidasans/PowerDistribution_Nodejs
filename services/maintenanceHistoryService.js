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

        -- Asset
        am.asset_no,
        am.asset_name,
        am.purchase_date,
        am.asset_value,
        am.serial_no,
        am.vendor_id,
        am.upload_invoice_url,
        am.status_id,
        am.maintenance_cycle_id,
        am.next_maintenance_date,
        am.warranty_expiry_date,
        am.upload_document_url,
        am.branch_id,
        am.department_id,
        am.receipt_id,
        am.upload_disposal_document_url,
        am.disposal_reason,
        am.journal_entry_id,
        am.ledger_account_id,
        am.created_at AS asset_created_at,
        am.updated_at AS asset_updated_at,

        -- Lookup tables
        mt.type_name,
        je.journal_no,
        v.vendor_name,
        b.branch_name,
        r.role_name,
        l.ledger_name,

        CASE 
          WHEN am.status_id = 1 THEN 'Update pending'
          WHEN am.status_id = 2 THEN 'Under maintenance'
          WHEN am.status_id = 3 THEN 'In use'
          WHEN am.status_id = 4 THEN 'Retired'
          ELSE NULL
        END AS status,

        CASE 
          WHEN am.maintenance_cycle_id = 1 THEN 'Daily'
          WHEN am.maintenance_cycle_id = 2 THEN 'Weekly'
          WHEN am.maintenance_cycle_id = 3 THEN 'Monthly'
          WHEN am.maintenance_cycle_id = 4 THEN 'Quarterly'
          WHEN am.maintenance_cycle_id = 5 THEN 'Half yearly'
          WHEN am.maintenance_cycle_id = 6 THEN 'Yearly'
          ELSE NULL
        END AS maintenance_cycle,

        CASE 
          WHEN mh.machine_performance_id = 1 THEN 'Good'
          WHEN mh.machine_performance_id = 2 THEN 'Fair'
          WHEN mh.machine_performance_id = 3 THEN 'Poor'
          WHEN mh.machine_performance_id = 4 THEN 'Needs Attention'
          ELSE NULL
        END AS machine_performance

      FROM maintenance_history mh
      LEFT JOIN asset_management am ON mh.asset_management_id = am.id
      LEFT JOIN maintenance_types mt ON mh.maintenance_type_id = mt.id
      LEFT JOIN journal_entries je ON am.journal_entry_id = je.id
      LEFT JOIN vendors v ON am.vendor_id = v.id
      LEFT JOIN branches b ON am.branch_id = b.id
      LEFT JOIN roles r ON am.department_id = r.department_id
      LEFT JOIN ledger l ON am.ledger_account_id = l.id
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
      query += `
        AND (
          am.asset_no LIKE :search
          OR am.asset_name LIKE :search
          OR mh.technician_name LIKE :search
          OR l.ledger_name LIKE :search
        )
      `;
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

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      replacements,
    });

    const maintenanceHistoryArray = [];
    let assetManagement = null;

    results.forEach(row => {
      const {
        id,
        date,
        asset_management_id,
        maintenance_type_id,
        technician_name,
        machine_performance_id,
        machine_performance,
        remarks,
        cost,
        description,
        next_service_date,
        created_at,
        updated_at,
        deleted_at,
        type_name,

        asset_no,
        asset_name,
        purchase_date,
        asset_value,
        serial_no,
        vendor_id,
        vendor_name,
        upload_invoice_url,
        status_id,
        status,
        maintenance_cycle_id,
        maintenance_cycle,
        next_maintenance_date,
        warranty_expiry_date,
        upload_document_url,
        branch_id,
        branch_name,
        department_id,
        role_name,
        receipt_id,
        upload_disposal_document_url,
        disposal_reason,
        journal_entry_id,
        journal_no,
        ledger_account_id,
        ledger_name,
        asset_created_at,
        asset_updated_at,
      } = row;

      maintenanceHistoryArray.push({
        id,
        date,
        asset_management_id,
        maintenance_type_id,
        technician_name,
        machine_performance_id,
        machine_performance,
        remarks,
        cost,
        description,
        next_service_date,
        created_at,
        updated_at,
        deleted_at,
        type_name,
      });

      if (!assetManagement && asset_management_id) {
        assetManagement = {
          id: asset_management_id,
          asset_no,
          asset_name,
          purchase_date,
          asset_value,
          serial_no,
          vendor_id,
          vendor_name,
          upload_invoice_url,
          status_id,
          status,
          maintenance_cycle_id,
          maintenance_cycle,
          next_maintenance_date,
          warranty_expiry_date,
          upload_document_url,
          branch_id,
          branch_name,
          department_id,
          role_name,
          receipt_id,
          upload_disposal_document_url,
          disposal_reason,
          journal_entry_id,
          journal_no,
          ledger_account_id,
          ledger_name,
          created_at: asset_created_at,
          updated_at: asset_updated_at,
        };
      }
    });

    // If no maintenance history found
    if (results.length === 0 && asset_management_id) {
      const assetQuery = `
        SELECT
          am.*,
          v.vendor_name,
          je.journal_no,
          b.branch_name,
          r.role_name,
          l.ledger_name,

          CASE 
            WHEN am.status_id = 1 THEN 'Update pending'
            WHEN am.status_id = 2 THEN 'Under maintenance'
            WHEN am.status_id = 3 THEN 'In use'
            WHEN am.status_id = 4 THEN 'Retired'
            ELSE NULL
          END AS status,

          CASE 
            WHEN am.maintenance_cycle_id = 1 THEN 'Daily'
            WHEN am.maintenance_cycle_id = 2 THEN 'Weekly'
            WHEN am.maintenance_cycle_id = 3 THEN 'Monthly'
            WHEN am.maintenance_cycle_id = 4 THEN 'Quarterly'
            WHEN am.maintenance_cycle_id = 5 THEN 'Half yearly'
            WHEN am.maintenance_cycle_id = 6 THEN 'Yearly'
            ELSE NULL
          END AS maintenance_cycle

        FROM asset_management am
        LEFT JOIN vendors v ON am.vendor_id = v.id
        LEFT JOIN journal_entries je ON am.journal_entry_id = je.id
        LEFT JOIN branches b ON am.branch_id = b.id
        LEFT JOIN roles r ON am.department_id = r.department_id
        LEFT JOIN ledger l ON am.ledger_account_id = l.id
        WHERE am.id = :asset_management_id
          AND am.deleted_at IS NULL
      `;

      const assetResult = await sequelize.query(assetQuery, {
        type: sequelize.QueryTypes.SELECT,
        replacements: { asset_management_id },
      });

      assetManagement = assetResult[0] || {};
    }

    return commonService.okResponse(res, {
      data: {
        maintenance_history: maintenanceHistoryArray,
        asset_management: assetManagement,
      },
    });

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
