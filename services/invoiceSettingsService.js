const { models, sequelize } = require("../models/index");
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

// Bulk Update Invoice Settings
const bulkUpdate = async (req, res) => {
  try {
    const { invoiceSettings } = req.body;

    // Validate input
    if (!Array.isArray(invoiceSettings) || invoiceSettings.length === 0) {
      return commonService.badRequest(
        res,
        "invoiceSettings array is required and cannot be empty"
      );
    }

    // Validate each invoice setting object has an ID
    const errors = [];
    const validInvoiceSettings = [];
    const updateIds = [];

    for (let i = 0; i < invoiceSettings.length; i++) {
      const setting = invoiceSettings[i];
      const index = i + 1;

      if (!setting.id) {
        errors.push(`Item ${index}: id is required for update`);
        continue;
      }

      updateIds.push(setting.id);
      validInvoiceSettings.push(setting);
    }

    if (errors.length > 0) {
      return commonService.badRequest(res, {
        message: "Validation failed",
        errors: errors,
      });
    }

    // Check if all invoice settings exist
    const existingSettings = await models.InvoiceSetting.findAll({
      where: { id: { [Op.in]: updateIds } },
      attributes: ["id", "branch_id", "invoice_sequence_name_id"],
    });

    const foundIds = existingSettings.map((setting) => setting.id);
    const missingIds = updateIds.filter((id) => !foundIds.includes(id));

    if (missingIds.length > 0) {
      return commonService.badRequest(
        res,
        `Invoice settings not found: ${missingIds.join(", ")}`
      );
    }

    // Validate branch_id changes and sequence name uniqueness
    const branchIds = [];
    for (let i = 0; i < validInvoiceSettings.length; i++) {
      const setting = validInvoiceSettings[i];
      const existingSetting = existingSettings.find(
        (es) => es.id === setting.id
      );
      const index = i + 1;

      // If branch_id is being updated, collect it for validation
      if (
        setting.branch_id &&
        setting.branch_id !== existingSetting.branch_id
      ) {
        branchIds.push(setting.branch_id);
      }

      // Check for duplicate sequence name within same branch for updates
      if (
        (setting.branch_id &&
          setting.branch_id !== existingSetting.branch_id) ||
        (setting.invoice_sequence_name_id &&
          setting.invoice_sequence_name_id !==
            existingSetting.invoice_sequence_name_id)
      ) {
        const finalBranchId = setting.branch_id || existingSetting.branch_id;
        const finalSequenceName =
          setting.invoice_sequence_name_id ||
          existingSetting.invoice_sequence_name_id;

        const sequenceExists = await models.InvoiceSetting.findOne({
          where: {
            branch_id: finalBranchId,
            invoice_sequence_name_id: finalSequenceName,
            id: { [Op.ne]: setting.id },
          },
        });

        if (sequenceExists) {
          errors.push(
            `Item ${index}: Invoice setting with sequence name '${finalSequenceName}' already exists for branch ${finalBranchId}`
          );
        }
      }
    }

    // Verify all new branches exist
    if (branchIds.length > 0) {
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
        errors.push(`Branches not found: ${missingBranchIds.join(", ")}`);
      }
    }

    if (errors.length > 0) {
      return commonService.badRequest(res, {
        message: "Validation failed",
        errors: errors,
      });
    }

    // Perform bulk update
    const updatedInvoiceSettings = [];
    for (const setting of validInvoiceSettings) {
      const existingSetting = existingSettings.find(
        (es) => es.id === setting.id
      );

      const invoiceSettingRecord = await models.InvoiceSetting.findByPk(
        setting.id
      );

      await invoiceSettingRecord.update({
        branch_id:
          setting.branch_id !== undefined
            ? setting.branch_id
            : invoiceSettingRecord.branch_id,
        invoice_sequence_name_id:
          setting.invoice_sequence_name_id !== undefined
            ? setting.invoice_sequence_name_id
            : invoiceSettingRecord.invoice_sequence_name_id,
        invoice_prefix:
          setting.invoice_prefix !== undefined
            ? setting.invoice_prefix
            : invoiceSettingRecord.invoice_prefix,
        invoice_suffix:
          setting.invoice_suffix !== undefined
            ? setting.invoice_suffix
            : invoiceSettingRecord.invoice_suffix,
        invoice_start_no:
          setting.invoice_start_no !== undefined
            ? setting.invoice_start_no
            : invoiceSettingRecord.invoice_start_no,
        status_id:
          setting.status_id !== undefined
            ? setting.status_id
            : invoiceSettingRecord.status_id,
      });

      updatedInvoiceSettings.push(invoiceSettingRecord);
    }

    return commonService.okResponse(res, {
      message: `${updatedInvoiceSettings.length} invoice settings updated successfully`,
      invoiceSettings: updatedInvoiceSettings,
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
    let includeClause = [
      {
        model: models.Branch,
        as: "branch",
        attributes: ["id", "branch_name", "branch_no"],
      },
      {
        model: models.InvoiceSettingEnum,
        as: "invoiceSequenceName",
        attributes: ["id", "invoice_setting_enum", "status"],
        required: false, // LEFT JOIN
      },
    ];

    if (searchKey) {
      whereClause[Op.or] = [
        { invoice_prefix: { [Op.iLike]: `%${searchKey}%` } },
        { invoice_suffix: { [Op.iLike]: `%${searchKey}%` } },
        // Search in invoice_setting_enum table
        {
          "$invoiceSequenceName.invoice_setting_enum$": {
            [Op.iLike]: `%${searchKey}%`,
          },
        },
      ];
    }

    if (branchId) {
      whereClause.branch_id = branchId;
    }

    const invoiceSettings = await models.InvoiceSetting.findAll({
      where: whereClause,
      include: includeClause,
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
        {
          model: models.InvoiceSettingEnum,
          as: "invoiceSequenceName",
          attributes: ["id", "invoice_setting_enum", "status"],
          required: false, // LEFT JOIN
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
        {
          model: models.InvoiceSettingEnum,
          as: "invoiceSequenceName",
          attributes: ["id", "invoice_setting_enum", "status"],
          required: false, // LEFT JOIN
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

// List Invoice Settings with Raw Query (Alternative approach)
const listWithRawQuery = async (req, res) => {
  try {
    const searchKey = req.query.search || "";
    const branchId = req.query.branch_id;

    const query = `
      SELECT
          inv.id,
          inv.branch_id,
          inv.invoice_sequence_name_id,
          inv.invoice_prefix,
          inv.invoice_suffix,
          inv.invoice_start_no,
          inv.status_id,
          inv.created_at,
          inv.updated_at,
          b.branch_name,
          b.branch_no,
          ise.invoice_setting_enum,
          ise.status as enum_status
      FROM invoice_settings inv
      LEFT JOIN branches b ON inv.branch_id = b.id
      LEFT JOIN invoice_setting_enum ise ON inv.invoice_sequence_name_id = ise.id
      WHERE
          (:branchId IS NULL OR inv.branch_id = :branchId)
          AND (
              :searchKey = ''
              OR inv.invoice_prefix ILIKE :searchPattern
              OR inv.invoice_suffix ILIKE :searchPattern
              OR ise.invoice_setting_enum ILIKE :searchPattern
          )
          AND inv.deleted_at IS NULL
      ORDER BY inv.created_at DESC;
    `;

    const replacements = {
      branchId: branchId || null,
      searchKey,
      searchPattern: `%${searchKey}%`,
    };

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, { invoiceSettings: results });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  create,
  bulkCreate,
  bulkUpdate,
  list,
  listWithRawQuery,
  getById,
  getByBranchId,
  update,
  remove,
  toggleStatus,
};
