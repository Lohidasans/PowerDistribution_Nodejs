const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");

// Create Invoice Setting
const create = async (req, res) => {
  try {
    const {
      branch_id,
      sequence_name,
      invoice_prefix,
      invoice_suffix,
      invoice_start_no,
      status_id = 1,
    } = req.body;

    // Check if invoice setting already exists for this branch
    const invoiceSettingExists = await models.InvoiceSetting.findOne({
      where: { branch_id },
    });

    if (invoiceSettingExists) {
      return commonService.badRequest(
        res,
        "Invoice setting already exists for this branch"
      );
    }

    // Verify branch exists
    const branch = await models.Branch.findByPk(branch_id);
    if (!branch) {
      return commonService.badRequest(res, "Branch not found");
    }

    // Create new invoice setting
    const invoiceSetting = await models.InvoiceSetting.create({
      branch_id,
      sequence_name,
      invoice_prefix,
      invoice_suffix,
      invoice_start_no,
      status_id,
    });

    return commonService.createdResponse(res, { invoiceSetting });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List Invoice Settings with optional search and branch filter
const list = async (req, res) => {
  try {
    const searchKey = req.query.search || "";
    const branchId = req.query.branch_id;

    let whereClause = {};

    if (searchKey) {
      whereClause[Op.or] = [
        { sequence_name: { [Op.iLike]: `%${searchKey}%` } },
        { invoice_prefix: { [Op.iLike]: `%${searchKey}%` } },
        { invoice_suffix: { [Op.iLike]: `%${searchKey}%` } },
      ];
    }

    if (branchId) {
      whereClause.branch_id = branchId;
    }

    const invoiceSettings = await models.InvoiceSetting.findAll({
      where: whereClause,
      include: [
        {
          model: models.Branch,
          as: "branch",
          attributes: ["id", "branch_name", "branch_no"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { invoiceSettings });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Invoice Setting by ID
const getById = async (req, res) => {
  try {
    const invoiceSetting = await models.InvoiceSetting.findByPk(req.params.id, {
      include: [
        {
          model: models.Branch,
          as: "branch",
          attributes: ["id", "branch_name", "branch_no"],
        },
      ],
    });

    if (!invoiceSetting) {
      return commonService.notFound(res, message.failure.notFound);
    }

    return commonService.okResponse(res, { invoiceSetting });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Invoice Setting by Branch ID
const getByBranchId = async (req, res) => {
  try {
    const invoiceSetting = await models.InvoiceSetting.findOne({
      where: { branch_id: req.params.branchId },
      include: [
        {
          model: models.Branch,
          as: "branch",
          attributes: ["id", "branch_name", "branch_no"],
        },
      ],
    });

    if (!invoiceSetting) {
      return commonService.notFound(
        res,
        "Invoice setting not found for this branch"
      );
    }

    return commonService.okResponse(res, { invoiceSetting });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update Invoice Setting
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      branch_id,
      sequence_name,
      invoice_prefix,
      invoice_suffix,
      invoice_start_no,
      status_id,
    } = req.body;

    const invoiceSetting = await commonService.findById(
      models.InvoiceSetting,
      id,
      res
    );
    if (!invoiceSetting) return;

    // Check if the new branch_id already has an invoice setting (excluding current record)
    if (branch_id && branch_id !== invoiceSetting.branch_id) {
      const invoiceSettingExists = await models.InvoiceSetting.findOne({
        where: {
          branch_id,
          id: { [Op.ne]: id },
        },
      });

      if (invoiceSettingExists) {
        return commonService.badRequest(
          res,
          "Invoice setting already exists for this branch"
        );
      }

      // Verify new branch exists
      const branch = await models.Branch.findByPk(branch_id);
      if (!branch) {
        return commonService.badRequest(res, "Branch not found");
      }
    }

    // Update invoice setting
    await invoiceSetting.update({
      branch_id: branch_id || invoiceSetting.branch_id,
      sequence_name: sequence_name || invoiceSetting.sequence_name,
      invoice_prefix:
        invoice_prefix !== undefined
          ? invoice_prefix
          : invoiceSetting.invoice_prefix,
      invoice_suffix:
        invoice_suffix !== undefined
          ? invoice_suffix
          : invoiceSetting.invoice_suffix,
      invoice_start_no:
        invoice_start_no !== undefined
          ? invoice_start_no
          : invoiceSetting.invoice_start_no,
      status_id: status_id || invoiceSetting.status_id,
    });

    return commonService.okResponse(res, { invoiceSetting });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Soft Delete Invoice Setting
const remove = async (req, res) => {
  try {
    const invoiceSetting = await commonService.findById(
      models.InvoiceSetting,
      req.params.id,
      res
    );
    if (!invoiceSetting) return;

    await invoiceSetting.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Toggle Status (activate/deactivate)
const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id } = req.body;

    const invoiceSetting = await commonService.findById(
      models.InvoiceSetting,
      id,
      res
    );
    if (!invoiceSetting) return;

    invoiceSetting.status_id = status_id;
    await invoiceSetting.save();

    return commonService.okResponse(res, { invoiceSetting });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  create,
  list,
  getById,
  getByBranchId,
  update,
  remove,
  toggleStatus,
};
