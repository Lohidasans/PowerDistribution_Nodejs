const { models, sequelize } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create Ledger Group
const create = async (req, res) => {
  try {
    const { ledger_group_name, ledger_group_no, status_id = 1, branch_id } = req.body;
    let { ledger_account_id, parent_group_id } = req.body;

    // Check if ledger group ID already exists
    const ledgerGroupExists = await models.LedgerGroup.findOne({
      where: {
        ledger_group_no,
      },
    });

    if (ledgerGroupExists) {
      return commonService.badRequest(
        res,
        "Ledger group with this ID already exists"
      );
    }

    // A sub-group inherits its nature (ledger_account_id) from its parent, so
    // the balance sheet always rolls it into the same Asset/Liability side.
    if (parent_group_id) {
      const parent = await models.LedgerGroup.findByPk(parent_group_id);
      if (!parent) {
        return commonService.badRequest(res, "Parent ledger group not found");
      }
      ledger_account_id = parent.ledger_account_id;
    }

    // Create new ledger group
    const ledgerGroup = await models.LedgerGroup.create({
      ledger_group_no,
      ledger_group_name,
      ledger_account_id,
      parent_group_id: parent_group_id || null,
      status_id,
      branch_id: branch_id || 1, // default to 1 if not provided
    });

    return commonService.createdResponse(res, { ledgerGroup });
  } catch (err) {
    console.error("Error creating ledger group:", err);
    return commonService.handleError(res, err);
  }
};

// Bulk Create Ledger Groups
const bulkCreate = async (req, res) => {
  try {
    const { ledgerGroups } = req.body;

    if (!Array.isArray(ledgerGroups) || ledgerGroups.length === 0) {
      return commonService.badRequest(
        res,
        "Valid ledger groups array is required"
      );
    }

    const createdLedgerGroups = await models.LedgerGroup.bulkCreate(
      ledgerGroups,
      {
        validate: true,
      }
    );

    return commonService.createdResponse(res, {
      ledgerGroups: createdLedgerGroups,
    });
  } catch (err) {
    console.error("Error bulk creating ledger groups:", err);
    return commonService.handleError(res, err);
  }
};

// List all Ledger Groups with optional search
const list = async (req, res) => {
  try {
    const { page, limit, search, status_id, branch_id } = req.query;

    const pageNumber = page ? parseInt(page, 10) : null;
    const pageSize = limit ? parseInt(limit, 10) : null;
    const offset = pageNumber && pageSize ? (pageNumber - 1) * pageSize : null;

    let where = `WHERE lg.deleted_at IS NULL`;
    const replacements = {};

    // Search
    if (search) {
      where += ` AND (
        lg.ledger_group_no ILIKE :search OR 
        lg.ledger_group_name ILIKE :search
      )`;
      replacements.search = `%${search}%`;
    }

    // Status
    if (status_id) {
      where += ` AND lg.status_id = :status_id`;
      replacements.status_id = status_id;
    }

    // Branch
    if (branch_id) {
      where += ` AND lg.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    let sql = `
      SELECT
        lg.*,
        la.account_name AS ledger_account_name,
        pg.ledger_group_name AS parent_group_name
        ${pageSize ? `, COUNT(*) OVER() AS total_count` : ``}
      FROM ledger_group lg
      LEFT JOIN ledger_accounts la
        ON la.id = lg.ledger_account_id
      LEFT JOIN ledger_group pg
        ON pg.id = lg.parent_group_id AND pg.deleted_at IS NULL
      ${where}
      ORDER BY lg.id ASC
    `;

    // Apply pagination ONLY if limit is provided
    if (pageSize) {
      sql += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = pageSize;
      replacements.offset = offset || 0;
    }

    const ledgerGroups = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Pagination response only if pagination is used
    let pagination = null;

    if (pageSize) {
      const total = ledgerGroups.length > 0 ? ledgerGroups[0].total_count : 0;

      pagination = {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }

    return commonService.okResponse(res, {
      ledgerGroups,
      pagination, // null if not used
    });

  } catch (err) {
    console.error("Error fetching ledger groups:", err);
    return commonService.handleError(res, err);
  }
};

// Get Ledger Group by ID
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        lg.*,
        la.account_name AS ledger_account_name,
        pg.ledger_group_name AS parent_group_name
      FROM ledger_group lg
      LEFT JOIN ledger_accounts la
        ON la.id = lg.ledger_account_id
      LEFT JOIN ledger_group pg
        ON pg.id = lg.parent_group_id AND pg.deleted_at IS NULL
      WHERE lg.id = :id
        AND lg.deleted_at IS NULL
      LIMIT 1
    `;

    const result = await sequelize.query(sql, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    });

    if (!result || result.length === 0) {
      return commonService.notFound(res, "Ledger group not found");
    }

    return commonService.okResponse(res, {
      ledgerGroup: result[0],
    });

  } catch (err) {
    console.error("Error fetching ledger group by ID:", err);
    return commonService.handleError(res, err);
  }
};

// Update Ledger Group
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { ledger_group_no, ledger_group_name, status_id } = req.body;
    let { ledger_account_id, parent_group_id } = req.body;

    const ledgerGroup = await models.LedgerGroup.findByPk(id);

    if (!ledgerGroup) {
      return commonService.notFound(res, "Ledger group not found");
    }

    // Check if updating to an existing ledger_group_no
    if (ledger_group_no && ledger_group_no !== ledgerGroup.ledger_group_no) {
      const existingLedgerGroup = await models.LedgerGroup.findOne({
        where: {
          ledger_group_no,
          id: { [Op.ne]: id }, // Exclude current record
        },
      });

      if (existingLedgerGroup) {
        return commonService.badRequest(
          res,
          "Ledger group with this ID already exists"
        );
      }
    }

    // Re-parenting: guard against cycles and inherit the parent's nature.
    if (parent_group_id !== undefined && parent_group_id) {
      if (parseInt(parent_group_id, 10) === parseInt(id, 10)) {
        return commonService.badRequest(res, "A ledger group cannot be its own parent");
      }
      // Walk up the proposed parent's ancestry; hitting this group = a cycle.
      let cursor = await models.LedgerGroup.findByPk(parent_group_id);
      if (!cursor) {
        return commonService.badRequest(res, "Parent ledger group not found");
      }
      const inheritedNature = cursor.ledger_account_id;
      while (cursor) {
        if (parseInt(cursor.id, 10) === parseInt(id, 10)) {
          return commonService.badRequest(
            res,
            "Cannot nest a ledger group under one of its own descendants"
          );
        }
        cursor = cursor.parent_group_id
          ? await models.LedgerGroup.findByPk(cursor.parent_group_id)
          : null;
      }
      ledger_account_id = inheritedNature; // sub-group inherits nature
    }

    // Update the ledger group
    await ledgerGroup.update({
      ledger_group_no: ledger_group_no || ledgerGroup.ledger_group_no,
      ledger_group_name: ledger_group_name || ledgerGroup.ledger_group_name,
      ledger_account_id: ledger_account_id || ledgerGroup.ledger_account_id,
      parent_group_id:
        parent_group_id !== undefined ? (parent_group_id || null) : ledgerGroup.parent_group_id,
      status_id: status_id !== undefined ? status_id : ledgerGroup.status_id,
    });

    return commonService.okResponse(res, { ledgerGroup });
  } catch (err) {
    console.error("Error updating ledger group:", err);
    return commonService.handleError(res, err);
  }
};

// Toggle Ledger Group Status
const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id } = req.body;

    if (status_id === undefined) {
      return commonService.badRequest(res, "Status ID is required");
    }

    const ledgerGroup = await models.LedgerGroup.findByPk(id);

    if (!ledgerGroup) {
      return commonService.notFound(res, "Ledger group not found");
    }

    await ledgerGroup.update({ status_id });

    return commonService.okResponse(res, {
      ledgerGroup,
      message: `Ledger group status updated to ${status_id}`,
    });
  } catch (err) {
    console.error("Error toggling ledger group status:", err);
    return commonService.handleError(res, err);
  }
};

// Delete Ledger Group (soft delete)
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const ledgerGroup = await models.LedgerGroup.findByPk(id);

    if (!ledgerGroup) {
      return commonService.notFound(res, "Ledger group not found");
    }

    await ledgerGroup.destroy(); // This uses paranoid deletion (soft delete)

    return commonService.okResponse(res, {
      message: "Ledger group deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting ledger group:", err);
    return commonService.handleError(res, err);
  }
};

// Generate next Ledger Group Number
const generateLedgerGroupNo = async (req, res) => {
  try {
    // Auto-generate next ledger_group_no in format LGID001
    const ledger_group_no = await generateFiscalSeriesCode(
      models.LedgerGroup,
      "ledger_group_no",
      "LGID",
      { pad: 3 }
    );

    return commonService.okResponse(res, { ledger_group_no });
  } catch (err) {
    console.error("Error generating ledger group number:", err);
    return commonService.handleError(res, err);
  }
};

const getLedgerAccounts = async (req, res) => {
  try {
    const sql = `
      SELECT 
        id,
        account_name
      FROM ledger_accounts
      WHERE deleted_at IS NULL
      ORDER BY account_name ASC
    `;

    const accounts = await sequelize.query(sql, {
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, {
      accounts,
    });

  } catch (err) {
    console.error("Error fetching ledger accounts:", err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  create,
  bulkCreate,
  list,
  getById,
  update,
  toggleStatus,
  remove,
  generateLedgerGroupNo,
  getLedgerAccounts
};
