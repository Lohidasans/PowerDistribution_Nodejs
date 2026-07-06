const { models, sequelize } = require("../models/index");
const { Op, QueryTypes } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create Ledger
const create = async (req, res) => {
  try {
    const { ledger_group_id, ledger_name, ledger_no, branch_id } = req.body;

    // Check if ledger group exists
    const ledgerGroup = await models.LedgerGroup.findByPk(ledger_group_id);
    if (!ledgerGroup) {
      return commonService.badRequest(res, "Ledger group not found");
    }

    // Create new ledger
    const ledger = await models.Ledger.create({
      ledger_no,
      ledger_group_id,
      ledger_name,
      branch_id: branch_id || 1, // default to 1 if not provided
    });

    // Get the created ledger with the ledger group details using raw query
    const [result] = await sequelize.query(
      `SELECT l.*, 
              lg.id as ledger_group_id_fk,
              lg.ledger_group_no, 
              lg.ledger_group_name
       FROM ledger l
       LEFT JOIN ledger_group lg ON l.ledger_group_id = lg.id
       WHERE l.id = :ledgerId AND l.deleted_at IS NULL`,
      {
        replacements: { ledgerId: ledger.id },
        type: QueryTypes.SELECT,
      }
    );

    // Transform to nested structure
    const createdLedger = {
      ...result,
      ledgerGroup: result.ledger_group_no ? {
        id: result.ledger_group_id,
        ledger_group_no: result.ledger_group_no,
        ledger_group_name: result.ledger_group_name,
      } : null
    };
    // Remove flat properties
    delete createdLedger.ledger_group_no;
    delete createdLedger.ledger_group_name;
    delete createdLedger.ledger_group_id_fk;

    return commonService.createdResponse(res, { ledger: createdLedger });
  } catch (err) {
    console.error("Error creating ledger:", err);
    return commonService.handleError(res, err);
  }
};

// Bulk Create Ledgers
const bulkCreate = async (req, res) => {
  try {
    const { ledgers } = req.body;

    if (!Array.isArray(ledgers) || ledgers.length === 0) {
      return commonService.badRequest(res, "Valid ledgers array is required");
    }

    // Validate that all ledger groups exist
    const ledgerGroupIds = [
      ...new Set(ledgers.map((ledger) => ledger.ledger_group_id)),
    ];
    const existingGroups = await models.LedgerGroup.findAll({
      where: { id: ledgerGroupIds },
    });

    if (existingGroups.length !== ledgerGroupIds.length) {
      return commonService.badRequest(
        res,
        "One or more ledger groups do not exist"
      );
    }

    const createdLedgers = await models.Ledger.bulkCreate(ledgers, {
      validate: true,
    });

    return commonService.createdResponse(res, { ledgers: createdLedgers });
  } catch (err) {
    console.error("Error bulk creating ledgers:", err);
    return commonService.handleError(res, err);
  }
};

// List all Ledgers with optional search and filters
const list = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, ledger_group_id, branch_id, bill_type_id } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ["l.deleted_at IS NULL"];
    let replacements = { limit: parseInt(limit), offset: parseInt(offset) };

    if (search) {
      whereConditions.push("l.ledger_name LIKE :search");
      replacements.search = `%${search}%`;
    }

    if (ledger_group_id) {
      whereConditions.push("l.ledger_group_id = :ledger_group_id");
      replacements.ledger_group_id = ledger_group_id;
    }

    if (branch_id) {
      whereConditions.push("l.branch_id = :branch_id");
      replacements.branch_id = branch_id;
    }

     // ===========================
    // ADVANCE RECEIPT RESTRICTION
    // ===========================
    if (Number(bill_type_id) === 3) {
       //If an Advance receipt already exists for the ledger, don't show it again.
      whereConditions.push(`
        NOT EXISTS (
          SELECT 1
          FROM voucher_receipts vr
          WHERE vr.account_id = l.id
            AND vr.bill_type_id = 3
            AND vr.deleted_at IS NULL
        )
      `);
    }

    const whereClause = whereConditions.join(" AND ");

    // Get total count
    const [countResult] = await sequelize.query(
      `SELECT COUNT(*) as total FROM ledger l WHERE ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Get ledgers with ledger group details
    const results = await sequelize.query(
      `SELECT l.*, 
              lg.ledger_group_no, 
              lg.ledger_group_name
       FROM ledger l
       LEFT JOIN ledger_group lg ON l.ledger_group_id = lg.id
       WHERE ${whereClause}
       ORDER BY l.id ASC
       LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    );

    // Transform to nested structure
    const ledgers = results.map(result => ({
      ...result,
      ledgerGroup: result.ledger_group_no ? {
        id: result.ledger_group_id,
        ledger_group_no: result.ledger_group_no,
        ledger_group_name: result.ledger_group_name,
      } : null,
      ledger_group_no: undefined,
      ledger_group_name: undefined,
    }));

    return commonService.okResponse(res, {
      ledgers,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching ledgers:", err);
    return commonService.handleError(res, err);
  }
};

// Get Ledger by ID
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await sequelize.query(
      `SELECT l.*, 
              lg.ledger_group_no, 
              lg.ledger_group_name
       FROM ledger l
       LEFT JOIN ledger_group lg ON l.ledger_group_id = lg.id
       WHERE l.id = :id AND l.deleted_at IS NULL`,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );

    if (!result) {
      return commonService.notFound(res, "Ledger not found");
    }

    // Transform to nested structure
    const ledger = {
      ...result,
      ledgerGroup: result.ledger_group_no ? {
        id: result.ledger_group_id,
        ledger_group_no: result.ledger_group_no,
        ledger_group_name: result.ledger_group_name,
      } : null
    };
    delete ledger.ledger_group_no;
    delete ledger.ledger_group_name;

    return commonService.okResponse(res, { ledger });
  } catch (err) {
    console.error("Error fetching ledger by ID:", err);
    return commonService.handleError(res, err);
  }
};

// Get Ledgers by Ledger Group ID
const getByLedgerGroupId = async (req, res) => {
  try {
    const { ledgerGroupId } = req.params;
    const { page = 1, limit = 10, branch_id } = req.query;
    const offset = (page - 1) * limit;

    // Check if ledger group exists
    const ledgerGroup = await models.LedgerGroup.findByPk(ledgerGroupId);
    if (!ledgerGroup) {
      return commonService.notFound(res, "Ledger group not found");
    }

    const where = { ledger_group_id: ledgerGroupId };
    if (branch_id) {
      where.branch_id = branch_id;
    }

    const { count, rows: ledgers } = await models.Ledger.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["id", "ASC"]],
    });

    return commonService.okResponse(res, {
      ledgers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching ledgers by ledger group ID:", err);
    return commonService.handleError(res, err);
  }
};

// Update Ledger
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { ledger_group_id, ledger_name } = req.body;

    const ledger = await models.Ledger.findByPk(id);

    if (!ledger) {
      return commonService.notFound(res, "Ledger not found");
    }

    // If ledger_group_id is provided, check if it exists
    if (ledger_group_id) {
      const ledgerGroup = await models.LedgerGroup.findByPk(ledger_group_id);
      if (!ledgerGroup) {
        return commonService.badRequest(res, "Ledger group not found");
      }
    }

    // Update the ledger (ledger_no is auto-generated and should not be updated)
    await ledger.update({
      ledger_group_id: ledger_group_id || ledger.ledger_group_id,
      ledger_name: ledger_name || ledger.ledger_name,
    });

    // Get the updated ledger with ledger group details using raw query
    const [result] = await sequelize.query(
      `SELECT l.*, 
              lg.ledger_group_no, 
              lg.ledger_group_name
       FROM ledger l
       LEFT JOIN ledger_group lg ON l.ledger_group_id = lg.id
       WHERE l.id = :id AND l.deleted_at IS NULL`,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
      }
    );

    // Transform to nested structure
    const updatedLedger = {
      ...result,
      ledgerGroup: result.ledger_group_no ? {
        id: result.ledger_group_id,
        ledger_group_no: result.ledger_group_no,
        ledger_group_name: result.ledger_group_name,
      } : null
    };
    delete updatedLedger.ledger_group_no;
    delete updatedLedger.ledger_group_name;

    return commonService.okResponse(res, { ledger: updatedLedger });
  } catch (err) {
    console.error("Error updating ledger:", err);
    return commonService.handleError(res, err);
  }
};

// Delete Ledger (soft delete)
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const ledger = await models.Ledger.findByPk(id);

    if (!ledger) {
      return commonService.notFound(res, "Ledger not found");
    }

    await ledger.destroy(); // This uses paranoid deletion (soft delete)

    return commonService.okResponse(res, {
      message: "Ledger deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting ledger:", err);
    return commonService.handleError(res, err);
  }
};

// Generate next Ledger Number
const generateLedgerNo = async (req, res) => {
  try {
    // Auto-generate next ledger_no in format LAID001
    const ledger_no = await generateFiscalSeriesCode(
      models.Ledger,
      "ledger_no",
      "LAID",
      { pad: 3 }
    );

    return commonService.okResponse(res, { ledger_no });
  } catch (err) {
    console.error("Error generating ledger number:", err);
    return commonService.handleError(res, err);
  }
};

const getLedgerDropdown = async (req, res) => {
  try {
    const rows = await models.Ledger.findAll({
      attributes: ["id", "ledger_name"], // ✅ only required fields
      where: {
        deleted_at: null   // ✅ exclude soft deleted records
      },
      order: [["ledger_name", "ASC"]] // optional sorting
    });

    return commonService.okResponse(res, {
      ledger_list: rows
    });

  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Ledgers selectable as the account for "On Account" voucher RECEIPTS
// (bill_type_id = 2): the GL/chart accounts such as "Capital A/c", "Bank
// Accounts", "Cash in Hand", PLUS customer party ledgers (Sundry Debtors) so a
// customer can pay "on account" (not tied to a specific bill). Vendor party
// ledgers (Sundry Creditors) are excluded — a receipt is money IN, which does
// not come from a vendor.
const getVoucherAccountLedgers = async (req, res) => {
  try {
    const { search, limit } = req.query;
    // Server-side search: return only a small matching page, never all ~1150.
    const max = Math.min(parseInt(limit, 10) || 50, 500);

    let where = `
      WHERE l.deleted_at IS NULL
        AND lg.deleted_at IS NULL
        AND lg.ledger_group_name <> 'Sundry Creditors'
    `;
    const replacements = { limit: max };

    if (search) {
      where += ` AND l.ledger_name ILIKE :search`;
      replacements.search = `%${search}%`;
    }

    const rows = await sequelize.query(
      `SELECT l.id,
              l.ledger_no,
              l.ledger_name,
              lg.id   AS ledger_group_id,
              lg.ledger_group_name
         FROM ledger l
         JOIN ledger_group lg ON lg.id = l.ledger_group_id
         ${where}
        ORDER BY lg.ledger_group_name ASC, l.ledger_name ASC
        LIMIT :limit`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    // key is `ledgers` to match the existing dropdown consumers on the frontend
    return commonService.okResponse(res, { ledgers: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  create,
  bulkCreate,
  list,
  getById,
  getByLedgerGroupId,
  update,
  remove,
  generateLedgerNo,
  getLedgerDropdown,
  getVoucherAccountLedgers
};
