const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");

// Create Invoice Setting
const create = async (req, res) => {
  try {
    const {
      branch_id,
      invoice_sequence_name_id,
      invoice_prefix,
      invoice_suffix,
      status_id = 1,
    } = req.body;

    // Check if sequence name already exists for this branch
    const sequenceExists = await models.InvoiceSetting.findOne({
      where: {
        branch_id,
        invoice_sequence_name_id,
      },
    });

    if (sequenceExists) {
      return commonService.badRequest(
        res,
        "Invoice setting with this sequence name already exists for this branch"
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
      invoice_sequence_name_id,
      invoice_prefix,
      invoice_suffix,
      status_id,
    });

    return commonService.createdResponse(res, { invoiceSetting });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Bulk Create Invoice Settings
const bulkCreate = async (req, res) => {
  try {
    const { invoiceSettings } = req.body;

    // Validate input
    if (!Array.isArray(invoiceSettings) || invoiceSettings.length === 0) {
      return commonService.badRequest(
        res,
        "invoiceSettings array is required and cannot be empty"
      );
    }

    // Validate each invoice setting object
    const errors = [];
    const validInvoiceSettings = [];
    const branchIds = invoiceSettings
      .map((setting) => setting.branch_id)
      .filter((id) => id);

    // Check for duplicate invoice_sequence_name_id within same branch_id in the request
    const branchSequenceMap = new Map();
    for (let i = 0; i < invoiceSettings.length; i++) {
      const setting = invoiceSettings[i];
      const key = `${setting.branch_id}_${setting.invoice_sequence_name_id}`;

      if (branchSequenceMap.has(key)) {
        errors.push(
          `Duplicate invoice_sequence_name_id '${setting.invoice_sequence_name_id}' found for branch_id ${setting.branch_id} in request`
        );
      } else {
        branchSequenceMap.set(key, i);
      }
    }

    if (errors.length > 0) {
      return commonService.badRequest(res, {
        message: "Validation failed",
        errors: errors,
      });
    }

    // Check if any sequence names already exist for their respective branches
    const existingSequences = await models.InvoiceSetting.findAll({
      where: {
        [Op.or]: invoiceSettings.map((setting) => ({
          branch_id: setting.branch_id,
          invoice_sequence_name_id: setting.invoice_sequence_name_id,
        })),
      },
      attributes: ["branch_id", "invoice_sequence_name_id"],
    });

    if (existingSequences.length > 0) {
      const existingCombinations = existingSequences.map(
        (setting) =>
          `branch_id: ${setting.branch_id}, invoice_sequence_name_id: '${setting.invoice_sequence_name_id}'`
      );
      return commonService.badRequest(
        res,
        `Invoice settings with these combinations already exist: ${existingCombinations.join(
          "; "
        )}`
      );
    }

    // Verify all branches exist
    const uniqueBranchIds = [...new Set(branchIds)];
    const branches = await models.Branch.findAll({
      where: { id: { [Op.in]: uniqueBranchIds } },
      attributes: ["id"],
    });

    const foundBranchIds = branches.map((branch) => branch.id);
    const missingBranchIds = uniqueBranchIds.filter(
      (id) => !foundBranchIds.includes(id)
    );

    if (missingBranchIds.length > 0) {
      return commonService.badRequest(
        res,
        `Branches not found: ${missingBranchIds.join(", ")}`
      );
    }

    // Validate and prepare data for each invoice setting
    for (let i = 0; i < invoiceSettings.length; i++) {
      const setting = invoiceSettings[i];
      const index = i + 1;

      if (!setting.branch_id) {
        errors.push(`Item ${index}: branch_id is required`);
        continue;
      }

      if (!setting.invoice_sequence_name_id) {
        errors.push(`Item ${index}: invoice_sequence_name_id is required`);
        continue;
      }

      validInvoiceSettings.push({
        branch_id: setting.branch_id,
        invoice_sequence_name_id: setting.invoice_sequence_name_id,
        invoice_prefix: setting.invoice_prefix || null,
        invoice_suffix: setting.invoice_suffix || null,
        invoice_start_no: setting.invoice_start_no || null,
        status_id: setting.status_id || 1,
      });
    }

    if (errors.length > 0) {
      return commonService.badRequest(res, {
        message: "Validation failed",
        errors: errors,
      });
    }

    // Bulk create invoice settings
    const createdInvoiceSettings = await models.InvoiceSetting.bulkCreate(
      validInvoiceSettings,
      {
        returning: true,
        validate: true,
      }
    );

    return commonService.createdResponse(res, {
      message: `${createdInvoiceSettings.length} invoice settings created successfully`,
      invoiceSettings: createdInvoiceSettings,
    });
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
        { invoice_sequence_name_id: { [Op.iLike]: `%${searchKey}%` } },
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
      return commonService.badRequest(res, message.failure.notFound);
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
      invoice_sequence_name_id,
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

    // Check if sequence name already exists for the branch (excluding current record)
    const finalBranchId = branch_id || invoiceSetting.branch_id;
    const finalSequenceName =
      invoice_sequence_name_id || invoiceSetting.invoice_sequence_name_id;

    if (
      (branch_id && branch_id !== invoiceSetting.branch_id) ||
      (invoice_sequence_name_id &&
        invoice_sequence_name_id !== invoiceSetting.invoice_sequence_name_id)
    ) {
      const sequenceExists = await models.InvoiceSetting.findOne({
        where: {
          branch_id: finalBranchId,
          invoice_sequence_name_id: finalSequenceName,
          id: { [Op.ne]: id },
        },
      });

      if (sequenceExists) {
        return commonService.badRequest(
          res,
          "Invoice setting with this sequence name already exists for this branch"
        );
      }
    }

    // Verify branch exists if branch_id is being updated
    if (branch_id && branch_id !== invoiceSetting.branch_id) {
      const branch = await models.Branch.findByPk(branch_id);
      if (!branch) {
        return commonService.badRequest(res, "Branch not found");
      }
    }

    // Update invoice setting
    await invoiceSetting.update({
      branch_id: branch_id || invoiceSetting.branch_id,
      invoice_sequence_name_id:
        invoice_sequence_name_id || invoiceSetting.invoice_sequence_name_id,
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
  bulkCreate,
  list,
  getById,
  getByBranchId,
  update,
  remove,
  toggleStatus,
};
