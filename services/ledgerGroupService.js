const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");

// Create Ledger Group
const create = async (req, res) => {
  try {
    const { ledger_group_name, ledger_group_no, status_id = 1 } = req.body;

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

    // Create new ledger group
    const ledgerGroup = await models.LedgerGroup.create({
      ledger_group_no,
      ledger_group_name,
      status_id,
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
    const { page = 1, limit = 10, search, status_id } = req.query;
    const offset = (page - 1) * limit;

    let where = {};

    if (search) {
      where = {
        [Op.or]: [
          { ledger_group_no: { [Op.like]: `%${search}%` } },
          { ledger_group_name: { [Op.like]: `%${search}%` } },
        ],
      };
    }

    if (status_id) {
      where.status_id = status_id;
    }

    const { count, rows: ledgerGroups } =
      await models.LedgerGroup.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [["created_at", "DESC"]],
      });

    return commonService.okResponse(res, {
      ledgerGroups,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
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

    const ledgerGroup = await models.LedgerGroup.findByPk(id);

    if (!ledgerGroup) {
      return commonService.notFound(res, "Ledger group not found");
    }

    return commonService.okResponse(res, { ledgerGroup });
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

    // Update the ledger group
    await ledgerGroup.update({
      ledger_group_no: ledger_group_no || ledgerGroup.ledger_group_no,
      ledger_group_name: ledger_group_name || ledgerGroup.ledger_group_name,
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

module.exports = {
  create,
  bulkCreate,
  list,
  getById,
  update,
  toggleStatus,
  remove,
};
