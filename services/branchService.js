const { models, sequelize } = require("../models/index");
const message = require("../constants/en.json");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const { buildSearchCondition } = require("../helpers/queryHelper");
const { generateUniqueCode } = require("../helpers/codeGeneration");
const kycSvc = require("./kycDocumentService");
const bankSvc = require("./bankAccountService");
const userSvc = require("./userLoginService");

const createDefaultPayrollMasters = async (transaction, branchId) => {
  const defaults = [
    { payroll_master_type_id: 1, pay_type_name: 'Basic Salary', calculation_type_id: 1, payroll_value: 0 },
    { payroll_master_type_id: 1, pay_type_name: 'Incentive',    calculation_type_id: 1, payroll_value: 0 },
    { payroll_master_type_id: 2, pay_type_name: 'LOP',          calculation_type_id: 1, payroll_value: 0 },
  ];
  const data = defaults.map(d => ({ ...d, branch_id: branchId }));
  return models.PayrollMaster.bulkCreate(data, { transaction });
};

// Helper function to create default invoice settings for a branch
const createDefaultInvoiceSettings = async (transaction, branchId) => {
  try {
    // Get all active invoice setting enums
    const invoiceSettingEnums = await models.InvoiceSettingEnum.findAll({
      where: { status: "Active" },
      attributes: ["id"],
      transaction,
    });

    if (invoiceSettingEnums.length === 0) {
      console.warn("No active invoice setting enums found");
      return [];
    }

    // Create invoice settings for each enum
    const invoiceSettingsData = invoiceSettingEnums.map((enumItem) => ({
      branch_id: branchId,
      invoice_sequence_name_id: enumItem.id,
      invoice_prefix: null,
      invoice_suffix: null,
      invoice_start_no: null,
      status_id: 1,
    }));

    const createdInvoiceSettings = await models.InvoiceSetting.bulkCreate(
      invoiceSettingsData,
      { transaction }
    );

    return createdInvoiceSettings;
  } catch (error) {
    console.error("Error creating default invoice settings:", error);
    throw error;
  }
};

// Create a new Branch (with optional bank account, KYC docs, login)
const createBranch = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { bank_account, kyc_documents, login, ...branchInput } =
      req.body || {};

    const { branch_name } = branchInput;

    // Validate required fields
    if (!branch_name) {
      await t.rollback();
      return commonService.badRequest(res, message.branch.required);
    }

    // Generate branch_no BEFORE create (to satisfy NOT NULL): COMPANY_PREFIX + DISTRICT_SHORT + sequence (e.g., CJ_CHEN_01)
    const superAdmin = await models.SuperAdminProfile.findOne({ order: [["id", "ASC"]], transaction: t });
    if (!superAdmin?.branch_sequence_value) {
      await t.rollback();
      return commonService.badRequest(res, "Company code not configured in Super Admin Profile");
    }

    const district = await models.District.findByPk(branchInput.district_id, { transaction: t });
    if (!district?.short_name) {
      await t.rollback();
      return commonService.badRequest(res, "District short code not found");
    }

    const companyCode = String(superAdmin.branch_sequence_value).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const districtCode = String(district.short_name).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const generatedBranchNo = await generateUniqueCode(
      models.Branch,
      "branch_no",
      [companyCode, districtCode],
      { pad: 2, separator: "_" }
    );
    const branch = await models.Branch.create({ ...branchInput, branch_no: generatedBranchNo }, { transaction: t });

    // Optionally create a single bank account via reusable create helper
    let createdBankAccount = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        createdBankAccount = await bankSvc.createBankAccountByEntity(
          t,
          "branch",
          branch.id,
          bank_account
        );
      } catch (e) {
        await t.rollback();
        return commonService.badRequest(res, message.requiredEntityIdAndType);
      }
    }

    // Optionally create multiple KYC docs via reusable create helper
    let createdKycDocs = [];
    if (Array.isArray(kyc_documents) && kyc_documents.length > 0) {
      createdKycDocs = await kycSvc.createKycByEntity(
        t,
        "branch",
        branch.id,
        kyc_documents
      );
    }

    // Optionally create login via reusable create helper
    let createdUser = null;
    if (login && typeof login === "object" && Object.keys(login).length > 0) {
      const result = await userSvc.createUserByEntity(
        t,
        "branch",
        branch.id,
        login
      );

      if (result.error) {
        await t.rollback();
        return commonService.badRequest(res, result.error);
      }
      createdUser = result.user;
    }


    // Create default invoice settings for the branch
    let createdInvoiceSettings = [];
    try {
      createdInvoiceSettings = await createDefaultInvoiceSettings(t, branch.id);
    } catch (e) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "Failed to create default invoice settings"
      );
    }

    await createDefaultPayrollMasters(t, branch.id);

    await t.commit();

    // Compose response
    return commonService.createdResponse(res, {
      branch,
      bank_account: createdBankAccount,
      kyc_documents: createdKycDocs,
      login: createdUser,
      invoice_settings: createdInvoiceSettings,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// List branches with optional search and status filter using raw SQL joins
const listBranches = async (req, res) => {
  try {
    const searchKey = req.query.search || "";
    const status = req.query.status || "";
    const state_id = req.query.state_id || "";
    const district_id = req.query.district_id || "";

    // Build where conditions
    const whereConditions = ["b.deleted_at IS NULL"];
    const replacements = {};

    // Add search condition
    if (searchKey) {
      whereConditions.push(`(
        b.branch_no ILIKE :search OR 
        b.branch_name ILIKE :search OR 
        b.contact_person ILIKE :search OR
        d.district_name ILIKE :search OR
        s.state_name ILIKE :search 
        --OR
        --c.country_name ILIKE :search
      )`);
      replacements.search = `%${searchKey}%`;
    }

    // Add filters
    if (status) {
      whereConditions.push("b.status = :status");
      replacements.status = status;
    }
    if (state_id) {
      whereConditions.push("b.state_id = :state_id");
      replacements.state_id = state_id;
    }
    if (district_id) {
      whereConditions.push("b.district_id = :district_id");
      replacements.district_id = district_id;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Main query with joins
    const query = `
      SELECT 
        b.*,
        d.district_name,
        s.state_name
        --c.country_name
      FROM branches b
      LEFT JOIN districts d ON d.id = b.district_id
      LEFT JOIN states s ON s.id = b.state_id
      --LEFT JOIN countries c ON c.id = b.country_id
      ${whereClause}
      ORDER BY b.created_at DESC
    `;

    // Execute raw query
    const branches = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
      model: models.Branch,
      mapToModel: true
    });

    return commonService.okResponse(res, { branches });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get a single branch by ID with nested entities
const getBranchById = async (req, res) => {
  try {
    const id = req.params.id;

    // Validate ID is numeric to match Postgres integer type
    if (!id || isNaN(id)) {
      return commonService.badRequest(res, "Invalid branch ID");
    }

    const branch = await models.Branch.findByPk(id, {
      include: [
        {
          model: models.District,
          as: "district",
          attributes: ["id", "district_name", "short_name"],
        },
        {
          model: models.State,
          as: "state",
          attributes: ["id", "state_name", "state_code"],
        },
      ],
    });

    if (!branch) {
      return commonService.notFound(res, "Branch not found");
    }

    const [bank_account, kyc_documents, login, invoice_settings] =
      await Promise.all([
        models.BankAccount.findOne({
          where: { entity_type: "branch", entity_id: id },
        }),
        models.KycDocument.findAll({
          where: { entity_type: "branch", entity_id: id },
        }),
        models.User.findOne({
          where: { entity_type: "branch", entity_id: id },
        }),
        models.InvoiceSetting.findAll({
          where: { branch_id: id },
        }),
      ]);

    // Get invoice setting enum details for each invoice setting
    if (invoice_settings && invoice_settings.length > 0) {
      for (let setting of invoice_settings) {
        const enumDetail = await models.InvoiceSettingEnum.findByPk(
          setting.invoice_sequence_name_id,
          { attributes: ["id", "invoice_setting_enum"] }
        );
        setting.dataValues.invoice_setting_enum_detail = enumDetail;
      }
    }

    return commonService.okResponse(res, {
      branch,
      bank_account,
      kyc_documents,
      login,
      invoice_settings,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update a branch (with optional upserts for bank account, KYC docs, login)
const updateBranch = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const branch = await commonService.findById(models.Branch, id, res);
    if (!branch) {
      await t.rollback();
      return;
    }

    const { bank_account, kyc_documents, login, ...branchInput } =
      req.body || {};

    // Unique check if branch_no changed
    if (branchInput.branch_no && branchInput.branch_no !== branch.branch_no) {
      const exists = await models.Branch.findOne({
        where: { branch_no: branchInput.branch_no, id: { [Op.ne]: id } },
      });
      if (exists) {
        await t.rollback();
        return commonService.badRequest(res, message.branch.duplicateNo);
      }
    }

    await branch.update(branchInput, { transaction: t });

    // Update-only bank account via reusable update helper (no create on update)
    let upsertedBankAccount = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        upsertedBankAccount = await bankSvc.updateBankAccountByEntity(
          t,
          "branch",
          branch.id,
          bank_account
        );
      } catch (e) {
        await t.rollback();
        return commonService.handleError(res, e);
      }
    }

    // KYC via reusable update helper (update-only)
    let updatedKyc = [];
    if (Array.isArray(kyc_documents)) {
      updatedKyc = await kycSvc.updateKycByEntity(
        t,
        "branch",
        branch.id,
        kyc_documents
      );
    }

    // Update-only login via reusable update helper (no create on update)
    let upsertedUser = null;
    if (login && typeof login === "object") {
      try {
        upsertedUser = await userSvc.updateUserByEntity(
          t,
          "branch",
          branch.id,
          login
        );
      } catch (e) {
        await t.rollback();
        return commonService.handleError(res, e);
      }
    }

    await t.commit();
    return commonService.okResponse(res, {
      branch,
      bank_account: upsertedBankAccount,
      kyc_documents: updatedKyc,
      login: upsertedUser,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Soft delete a branch and its related ancillary records
const deleteBranch = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const branch = await commonService.findById(models.Branch, id, res);
    if (!branch) {
      await t.rollback();
      return;
    }

    // Delete ancillary records tied via entity_type/entity_id
    await models.BankAccount.destroy({
      where: { entity_type: "branch", entity_id: id },
      transaction: t,
    });
    await models.KycDocument.destroy({
      where: { entity_type: "branch", entity_id: id },
      transaction: t,
    });
    await models.User.destroy({
      where: { entity_type: "branch", entity_id: id },
      transaction: t,
    });

    // Delete invoice settings for this branch
    await models.InvoiceSetting.destroy({
      where: { branch_id: id },
      transaction: t,
    });

    // Soft delete branch
    await branch.destroy({ transaction: t });

    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const branchDropdownList = async (req, res) => {
  try {
    const { status } = req.query;

    // Build WHERE conditions
    const whereConditions = ['b.deleted_at IS NULL'];
    const replacements = {};

    // Add status filter if provided
    if (status) {
      whereConditions.push('b.status = :status');
      replacements.status = status;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT
        b.id,
        b.branch_name,
        b.branch_no,
        b.address,
        b.state_id,
        b.district_id,
        b.pin_code,
        b.status,
        s.state_name,
        d.district_name
      FROM branches b
      LEFT JOIN states s ON b.state_id = s.id
      LEFT JOIN districts d ON b.district_id = d.id
      WHERE ${whereClause}
      ORDER BY b.branch_name ASC
    `;

    const branches = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, { branches });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateBranchCode = async (req, res) => {
  try {
    const { company_code, location_code } = req.query || {};

    // Validate query params
    if (!company_code || !location_code) {
      return commonService.badRequest(res, message.branch.requiredCodes);
    }

    const branchCode = await generateUniqueCode(
      models.Branch,
      "branch_no",
      [company_code, location_code],
      { pad: 3, separator: "_" }
    );

    return commonService.okResponse(res, { branch_code: branchCode });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get branch dashboard statistics with top customers and top employees (optionally filtered by branch)
const getBranchDashboard = async (req, res) => {
  try {
    const { top_limit = 5, branch_id, period, start_date, end_date } = req.query; // Default to top 5 for dashboard

    // Build WHERE clause for branch filter
    let branchFilter = '';
    let dateFilter = '';
    const replacements = { limit: parseInt(top_limit, 10) };
    const currentDate = new Date();

    if (branch_id) {
      branchFilter = 'AND sib.branch_id = :branch_id';
      replacements.branch_id = parseInt(branch_id, 10);
    }

    // Build date filter based on period or custom date range
    if (period) {
      const periodValue = parseInt(period, 10);
      switch (periodValue) {
        case 1: // Today
          const today = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date = :today';
          replacements.today = today;
          break;

        case 2: // This Week
          // Get start of current week (Sunday)
          const startOfWeek = new Date(currentDate);
          startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
          const weekStart = startOfWeek.toISOString().split('T')[0];
          const weekEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :week_start AND :week_end';
          replacements.week_start = weekStart;
          replacements.week_end = weekEnd;
          break;

        case 3: // This Month
          const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
          const monthEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :month_start AND :month_end';
          replacements.month_start = monthStart;
          replacements.month_end = monthEnd;
          break;

        case 4: // This Year
          const yearStart = new Date(currentDate.getFullYear(), 0, 1).toISOString().split('T')[0];
          const yearEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :year_start AND :year_end';
          replacements.year_start = yearStart;
          replacements.year_end = yearEnd;
          break;

        default:
          // Invalid period, ignore
          break;
      }
    } else if (start_date && end_date) {
      // Custom date range
      dateFilter = 'AND sib.invoice_date BETWEEN :start_date AND :end_date';
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    } else if (start_date) {
      // Only start date provided
      dateFilter = 'AND sib.invoice_date >= :start_date';
      replacements.start_date = start_date;
    } else if (end_date) {
      // Only end date provided
      dateFilter = 'AND sib.invoice_date <= :end_date';
      replacements.end_date = end_date;
    }

    // Get total branches (excluding soft deleted)
    const totalBranches = await models.Branch.count({
      where: {
        deleted_at: null,
      },
    });

    // Get active branches
    const activeBranches = await models.Branch.count({
      where: {
        status: "Active",
        deleted_at: null,
      },
    });

    // Get inactive branches
    const inactiveBranches = await models.Branch.count({
      where: {
        status: "Inactive",
        deleted_at: null,
      },
    });

    // Get top buying customers
    const topCustomersQuery = `
      SELECT
        c.id AS customer_id,
        c.customer_code,
        c.customer_name,
        c.mobile_number,
        COALESCE(SUM(sib.total_amount), 0) AS total_amount,
        COUNT(sib.id) AS total_invoices
      FROM
        customers c
      LEFT JOIN
        sales_invoice_bills sib ON sib.customer_id = c.id
        AND sib.deleted_at IS NULL AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${branchFilter}
        ${dateFilter}
      WHERE
        c.deleted_at IS NULL
      GROUP BY
        c.id, c.customer_code, c.customer_name, c.mobile_number
      HAVING
        COALESCE(SUM(sib.total_amount), 0) > 0
      ORDER BY
        total_amount DESC
      LIMIT :limit
    `;

    const topCustomers = await sequelize.query(topCustomersQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Get top employee performers
    const topEmployeesQuery = `
      SELECT
        e.id AS employee_id,
        e.employee_no,
        e.employee_name,
        COALESCE(SUM(DISTINCT sib.total_amount), 0) AS sales_amount,
        COALESCE(SUM(sibi.net_weight), 0) AS total_weight,
        COUNT(DISTINCT sib.id) AS total_invoices
      FROM
        employees e
      LEFT JOIN
        sales_invoice_bills sib ON sib.employee_id = e.id
        AND sib.deleted_at IS NULL AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${branchFilter}
        ${dateFilter}
      LEFT JOIN
        sales_invoice_bill_items sibi ON sibi.invoice_bill_id = sib.id AND sibi.is_returned = false
        AND sibi.deleted_at IS NULL
      WHERE
        e.deleted_at IS NULL
      GROUP BY
        e.id, e.employee_no, e.employee_name
      HAVING
        COALESCE(SUM(DISTINCT sib.total_amount), 0) > 0
      ORDER BY
        sales_amount DESC
      LIMIT :limit
    `;

    const topEmployees = await sequelize.query(topEmployeesQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format top customers
    const formattedCustomers = topCustomers.map(customer => ({
      customer_id: customer.customer_id,
      customer_code: customer.customer_code,
      customer_name: customer.customer_name,
      mobile_number: customer.mobile_number,
      total_amount: parseFloat(customer.total_amount || 0).toFixed(2),
      total_invoices: parseInt(customer.total_invoices, 10),
    }));

    // Format top employees
    const formattedEmployees = topEmployees.map(employee => ({
      employee_id: employee.employee_id,
      employee_no: employee.employee_no,
      employee_name: employee.employee_name,
      weight: parseFloat(employee.total_weight || 0).toFixed(3),
      sales_amount: parseFloat(employee.sales_amount || 0).toFixed(2),
      total_invoices: parseInt(employee.total_invoices, 10),
    }));

    return commonService.okResponse(res, {
      branch_statistics: {
        total_branches: totalBranches,
        active_branches: activeBranches,
        inactive_branches: inactiveBranches,
      },
      top_buying_customers: formattedCustomers,
      top_employee_performers: formattedEmployees,
    });
  } catch (err) {
    console.error('Error in getBranchDashboard:', err);
    return commonService.handleError(res, err);
  }
};

// Get branch revenue comparison with flexible date filtering
const getBranchRevenueComparison = async (req, res) => {
  try {
    const { period, start_date, end_date } = req.query;

    // Build date filter based on period or custom date range
    let dateFilter = '';
    const replacements = {};
    const currentDate = new Date();

    if (period) {
      const periodValue = parseInt(period, 10);
      switch (periodValue) {
        case 1: // Today
          const today = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date = :today';
          replacements.today = today;
          break;

        case 2: // This Week
          // Get start of current week (Sunday)
          const startOfWeek = new Date(currentDate);
          startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
          const weekStart = startOfWeek.toISOString().split('T')[0];
          const weekEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :week_start AND :week_end';
          replacements.week_start = weekStart;
          replacements.week_end = weekEnd;
          break;

        case 3: // This Month
          const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
          const monthEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :month_start AND :month_end';
          replacements.month_start = monthStart;
          replacements.month_end = monthEnd;
          break;

        case 4: // This Year
          const yearStart = new Date(currentDate.getFullYear(), 0, 1).toISOString().split('T')[0];
          const yearEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :year_start AND :year_end';
          replacements.year_start = yearStart;
          replacements.year_end = yearEnd;
          break;

        default:
          // Invalid period, ignore
          break;
      }
    } else if (start_date && end_date) {
      // Custom date range
      dateFilter = 'AND sib.invoice_date BETWEEN :start_date AND :end_date';
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    } else if (start_date) {
      // Only start date provided
      dateFilter = 'AND sib.invoice_date >= :start_date';
      replacements.start_date = start_date;
    } else if (end_date) {
      // Only end date provided
      dateFilter = 'AND sib.invoice_date <= :end_date';
      replacements.end_date = end_date;
    }

    const query = `
      SELECT 
        b.id AS branch_id,
        b.branch_no,
        b.branch_name,
        b.status,
        COALESCE(SUM(sib.total_amount), 0) AS total_revenue,
        COUNT(sib.id) AS total_invoices,
        COALESCE(AVG(sib.total_amount), 0) AS average_invoice_value,
        MIN(sib.invoice_date) AS first_invoice_date,
        MAX(sib.invoice_date) AS last_invoice_date
      FROM 
        branches b
      LEFT JOIN 
        sales_invoice_bills sib ON sib.branch_id = b.id 
        AND sib.deleted_at IS NULL AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${dateFilter}
      WHERE 
        b.deleted_at IS NULL
      GROUP BY 
        b.id, b.branch_no, b.branch_name, b.status
      ORDER BY 
        total_revenue DESC
    `;

    const branchRevenues = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Calculate total revenue across all branches
    const totalRevenue = branchRevenues.reduce((sum, branch) =>
      sum + parseFloat(branch.total_revenue || 0), 0
    );

    // Format the response
    const formattedBranches = branchRevenues.map(branch => ({
      branch_id: branch.branch_id,
      branch_no: branch.branch_no,
      branch_name: branch.branch_name,
      status: branch.status,
      total_revenue: parseFloat(branch.total_revenue || 0).toFixed(2),
      total_invoices: parseInt(branch.total_invoices, 10),
      average_invoice_value: parseFloat(branch.average_invoice_value || 0).toFixed(2),
      revenue_percentage: totalRevenue > 0
        ? ((parseFloat(branch.total_revenue || 0) / totalRevenue) * 100).toFixed(2)
        : '0.00',
      first_invoice_date: branch.first_invoice_date,
      last_invoice_date: branch.last_invoice_date,
    }));

    return commonService.okResponse(res, {
      summary: {
        total_revenue: totalRevenue.toFixed(2),
        total_branches: branchRevenues.length,
        period: period || 'custom',
        start_date: replacements.start_date || replacements.today || replacements.week_start || replacements.month_start || replacements.year_start || null,
        end_date: replacements.end_date || replacements.today || replacements.week_end || replacements.month_end || replacements.year_end || null,
      },
      branches: formattedBranches,
    });
  } catch (err) {
    console.error('Error in getBranchRevenueComparison:', err);
    return commonService.handleError(res, err);
  }
};

// Get comprehensive branch statistics (Sales, Purchase, Stock, Revenue, Employees)
const getBranchStats = async (req, res) => {
  try {
    const { period, start_date, end_date, branch_id } = req.query;

    // Build date filter based on period or custom date range
    let dateFilter = '';
    let branchFilter = '';
    const replacements = {};
    const currentDate = new Date();

    if (branch_id) {
      branchFilter = 'AND b.id = :branch_id';
      replacements.branch_id = parseInt(branch_id, 10);
    }

    if (period) {
      const periodValue = parseInt(period, 10);
      switch (periodValue) {
        case 1: // Today
          const today = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date = :today';
          replacements.today = today;
          break;

        case 2: // This Week
          const startOfWeek = new Date(currentDate);
          startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
          const weekStart = startOfWeek.toISOString().split('T')[0];
          const weekEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :week_start AND :week_end';
          replacements.week_start = weekStart;
          replacements.week_end = weekEnd;
          break;

        case 3: // This Month
          const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
          const monthEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :month_start AND :month_end';
          replacements.month_start = monthStart;
          replacements.month_end = monthEnd;
          break;

        case 4: // This Year
          const yearStart = new Date(currentDate.getFullYear(), 0, 1).toISOString().split('T')[0];
          const yearEnd = currentDate.toISOString().split('T')[0];
          dateFilter = 'AND sib.invoice_date BETWEEN :year_start AND :year_end';
          replacements.year_start = yearStart;
          replacements.year_end = yearEnd;
          break;

        default:
          break;
      }
    } else if (start_date && end_date) {
      dateFilter = 'AND sib.invoice_date BETWEEN :start_date AND :end_date';
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    } else if (start_date) {
      dateFilter = 'AND sib.invoice_date >= :start_date';
      replacements.start_date = start_date;
    } else if (end_date) {
      dateFilter = 'AND sib.invoice_date <= :end_date';
      replacements.end_date = end_date;
    }

    const query = `
      SELECT 
        b.id AS branch_id,
        b.branch_no,
        b.branch_name,
        b.status,
        -- Sales Value (Total invoice amount)
        COALESCE(SUM(sib.total_amount), 0) AS sales_value,
        -- Purchase Value (Total GRN value of products in this branch)
        COALESCE((
          SELECT SUM(p.total_grn_value)
          FROM products p
          WHERE p.branch_id = b.id
          AND p.deleted_at IS NULL
        ), 0) AS purchase_value,
        -- Stock Value (Current stock value based on remaining products)
        COALESCE((
          SELECT SUM(p.total_grn_value)
          FROM products p
          WHERE p.branch_id = b.id
          AND p.deleted_at IS NULL
          AND p.status = 'Active'
        ), 0) AS stock_value,
        -- Total Revenue (same as sales value)
        COALESCE(SUM(sib.total_amount), 0) AS total_revenue,
        -- Total Employees in this branch
        COALESCE((
          SELECT COUNT(*)
          FROM employees e
          WHERE e.branch_id = b.id
          AND e.deleted_at IS NULL
        ), 0) AS total_employee
      FROM 
        branches b
      LEFT JOIN
        sales_invoice_bills sib ON sib.branch_id = b.id
        AND sib.deleted_at IS NULL AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${dateFilter}
      WHERE
        b.deleted_at IS NULL
        ${branchFilter}
      GROUP BY
        b.id, b.branch_no, b.branch_name, b.status
      ORDER BY
        b.id ASC
    `;

    const branchStats = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedStats = branchStats.map((branch, index) => ({
      s_no: index + 1,
      branch_name: branch.branch_name,
      sales_value: parseFloat(branch.sales_value || 0).toFixed(2),
      purchase_value: parseFloat(branch.purchase_value || 0).toFixed(2),
      stock_value: parseFloat(branch.stock_value || 0).toFixed(2),
      total_revenue: parseFloat(branch.total_revenue || 0).toFixed(2),
      total_employee: parseInt(branch.total_employee, 10),
      // Additional fields for reference
      branch_id: branch.branch_id,
      branch_no: branch.branch_no,
      status: branch.status,
    }));

    return commonService.okResponse(res, {
      branch_stats: formattedStats,
      period: period || 'custom',
      start_date: replacements.start_date || replacements.today || replacements.week_start || replacements.month_start || replacements.year_start || null,
      end_date: replacements.end_date || replacements.today || replacements.week_end || replacements.month_end || replacements.year_end || null,
    });
  } catch (err) {
    console.error('Error in getBranchStats:', err);
    return commonService.handleError(res, err);
  }
};

// Get branch details with location information
const getBranchDetails = async (req, res) => {
  try {
    const { state_id, district_id, search } = req.query;

    // Build filters
    let filters = [];
    const replacements = {};

    if (state_id) {
      filters.push('b.state_id = :state_id');
      replacements.state_id = parseInt(state_id, 10);
    }

    if (district_id) {
      filters.push('b.district_id = :district_id');
      replacements.district_id = parseInt(district_id, 10);
    }

    if (search) {
      filters.push(`(
        b.branch_name ILIKE :search OR
        b.branch_no ILIKE :search OR
        b.contact_person ILIKE :search OR
        d.district_name ILIKE :search
      )`);
      replacements.search = `%${search}%`;
    }

    const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

    const query = `
      SELECT
        b.id AS branch_id,
        b.branch_no,
        b.branch_name,
        d.district_name AS location,
        b.contact_person AS branch_admin,
        b.mobile AS contact_number,
        b.email,
        b.address,
        b.status,
        b.district_id,
        b.state_id,
        b.pin_code,
        b.gst_no
      FROM
        branches b
      LEFT JOIN
        districts d ON d.id = b.district_id
      WHERE
        b.deleted_at IS NULL
        ${whereClause}
      ORDER BY
        b.id ASC
    `;

    const branchDetails = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedDetails = branchDetails.map((branch, index) => ({
      s_no: index + 1,
      branch_no: branch.branch_no,
      branch_name: branch.branch_name,
      location: branch.location || 'N/A',
      branch_admin: branch.branch_admin || 'N/A',
      contact_number: branch.contact_number || 'N/A',
      // Additional fields for reference
      id: branch.branch_id,
      email: branch.email,
      address: branch.address,
      status: branch.status,
      district_id: branch.district_id,
      state_id: branch.state_id,
      pin_code: branch.pin_code,
      gst_no: branch.gst_no,
    }));

    return commonService.okResponse(res, {
      branch_details: formattedDetails,
      total_branches: formattedDetails.length,
    });
  } catch (err) {
    console.error('Error in getBranchDetails:', err);
    return commonService.handleError(res, err);
  }
};

// Get comprehensive branch-wise overview
const getBranchOverview = async (req, res) => {
  try {
    const { branch_id } = req.query;

    // Build branch filter
    let branchFilter = '';
    const replacements = {};

    if (branch_id) {
      branchFilter = 'AND b.id = :branch_id';
      replacements.branch_id = branch_id;
    }

    const query = `
      SELECT 
        b.id AS branch_id,
        b.branch_no,
        b.branch_name,
        b.status,
        -- Total Customers (unique customers who made purchases at this branch)
        COALESCE((
          SELECT COUNT(DISTINCT sib.customer_id)
          FROM sales_invoice_bills sib
          WHERE sib.branch_id = b.id
          AND sib.is_active = true
          AND sib.deleted_at IS NULL
          AND sib.customer_id IS NOT NULL
        ), 0) AS total_customers,
        -- Total Revenue from Sales Invoices
        COALESCE((
          SELECT SUM(sib.total_amount)
          FROM sales_invoice_bills sib
          WHERE sib.branch_id = b.id
          AND sib.deleted_at IS NULL
          AND sib.is_active = true
          AND sib.status != 'Cancelled'
        ), 0) AS sales_revenue,
        -- Total Revenue from Jewel Repairs
        COALESCE((
          SELECT SUM(jr.total_amount)
          FROM jewel_repairs jr
          WHERE jr.branch_id = b.id
          AND jr.deleted_at IS NULL AND jr.is_active = true
          AND jr.status != 'Cancelled'
        ), 0) AS repair_revenue,
        -- Total Stock Value (purchase value of products)
        COALESCE((
          SELECT SUM(p.total_grn_value)
          FROM products p
          WHERE p.branch_id = b.id
          AND p.deleted_at IS NULL
          AND p.status = 'Active'
        ), 0) AS total_stock_value,
        -- Total Stock Weight (remaining weight of products)
        COALESCE((
          SELECT SUM(p.remaining_weight)
          FROM products p
          WHERE p.branch_id = b.id
          AND p.deleted_at IS NULL
          AND p.status = 'Active'
        ), 0) AS total_stock_weight
      FROM 
        branches b
      WHERE 
        b.deleted_at IS NULL
        ${branchFilter}
      ORDER BY 
        b.id ASC
    `;

    const branchOverview = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedOverview = branchOverview.map((branch, index) => {
      const salesRevenue = parseFloat(branch.sales_revenue || 0);
      const repairRevenue = parseFloat(branch.repair_revenue || 0);
      const totalRevenue = salesRevenue + repairRevenue;

      return {
        s_no: index + 1,
        branch_id: branch.branch_id,
        branch_no: branch.branch_no,
        branch_name: branch.branch_name,
        status: branch.status,
        total_customers: parseInt(branch.total_customers, 10),
        total_revenue: totalRevenue.toFixed(2),
        revenue_breakdown: {
          sales_invoice: salesRevenue.toFixed(2),
          jewel_repair: repairRevenue.toFixed(2),
        },
        total_stock_value: parseFloat(branch.total_stock_value || 0).toFixed(2),
        total_stock_weight: parseFloat(branch.total_stock_weight || 0).toFixed(3),
      };
    });

    return commonService.okResponse(res, {
      branch_overview: formattedOverview,
      total_branches: formattedOverview.length,
    });
  } catch (err) {
    console.error('Error in getBranchOverview:', err);
    return commonService.handleError(res, err);
  }
};

// Get sales statistics for graphical representation
const getSalesStatistics = async (req, res) => {
  try {
    const { branch_id, period = 'monthly', year } = req.query;

    if (!branch_id) {
      return res.status(400).json({
        statusCode: 400,
        message: 'branch_id is required',
      });
    }

    const replacements = { branch_id };
    const currentYear = year || new Date().getFullYear();
    replacements.year = currentYear;

    let groupByClause = '';
    let selectClause = '';
    let orderByClause = '';

    switch (period.toLowerCase()) {
      case 'yearly':
        // Group by year for the last 10 years
        selectClause = `
          EXTRACT(YEAR FROM sib.invoice_date) AS period_year,
          TO_CHAR(TO_DATE(EXTRACT(YEAR FROM sib.invoice_date)::text, 'YYYY'), 'YYYY') AS period_label
        `;
        groupByClause = 'GROUP BY period_year';
        orderByClause = 'ORDER BY period_year ASC';
        replacements.start_year = currentYear - 9;
        replacements.end_year = currentYear;
        break;

      case 'weekly':
        // Group by day of week for the current year or specified date range
        selectClause = `
          EXTRACT(DOW FROM sib.invoice_date) AS day_of_week,
          TO_CHAR(sib.invoice_date, 'Dy') AS period_label
        `;
        groupByClause = 'GROUP BY day_of_week, period_label';
        orderByClause = 'ORDER BY day_of_week ASC';
        break;

      case 'monthly':
      default:
        // Group by month for the current year
        selectClause = `
          EXTRACT(MONTH FROM sib.invoice_date) AS period_month,
          TO_CHAR(sib.invoice_date, 'Mon') AS period_label
        `;
        groupByClause = 'GROUP BY period_month, period_label';
        orderByClause = 'ORDER BY period_month ASC';
        break;
    }

    let dateFilter = '';
    if (period.toLowerCase() === 'yearly') {
      dateFilter = `AND EXTRACT(YEAR FROM sib.invoice_date) BETWEEN :start_year AND :end_year`;
    } else {
      dateFilter = `AND EXTRACT(YEAR FROM sib.invoice_date) = :year`;
    }

    const query = `
      SELECT 
        ${selectClause},
        COALESCE(SUM(sib.total_amount), 0) AS total_sales,
        COUNT(sib.id) AS total_invoices
      FROM 
        sales_invoice_bills sib
      WHERE 
        sib.branch_id = :branch_id
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${dateFilter}
      ${groupByClause}
      ${orderByClause}
    `;

    const salesData = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response for chart display
    const formattedData = salesData.map(item => ({
      period: item.period_label,
      total_sales: parseFloat(item.total_sales || 0).toFixed(2),
      total_invoices: parseInt(item.total_invoices, 10),
    }));

    // Fill in missing periods with zero values for complete chart
    let completeData = [];

    if (period.toLowerCase() === 'monthly') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      completeData = months.map((month, index) => {
        const existing = formattedData.find(d => d.period === month);
        return existing || {
          period: month,
          total_sales: '0.00',
          total_invoices: 0,
        };
      });
    } else if (period.toLowerCase() === 'weekly') {
      // Days of the week (Sunday = 0, Saturday = 6)
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      completeData = daysOfWeek.map((day, index) => {
        const existing = formattedData.find(d => d.period === day);
        return existing || {
          period: day,
          total_sales: '0.00',
          total_invoices: 0,
        };
      });
    } else {
      // Yearly - just use the data as is
      completeData = formattedData;
    }

    return commonService.okResponse(res, {
      sales_statistics: completeData,
      period: period.toLowerCase(),
      year: currentYear,
      branch_id: parseInt(branch_id, 10),
    });
  } catch (err) {
    console.error('Error in getSalesStatistics:', err);
    return commonService.handleError(res, err);
  }
};

// Get customer visits (invoice counts) for graphical representation
const getCustomerVisits = async (req, res) => {
  try {
    const { branch_id, start_date, end_date } = req.query;
    const replacements = {};
    let whereClause = "sib.deleted_at IS NULL AND sib.is_active = true AND sib.status != 'Cancelled'";

    if (branch_id) {
      whereClause += " AND sib.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    // Default to current week if no dates provided
    if (!start_date || !end_date) {
      // Postgres: date_trunc('week', current_date) returns Monday of current week
      // We want to cover the full week.
      whereClause += ` 
        AND sib.invoice_date >= date_trunc('week', CURRENT_DATE) 
        AND sib.invoice_date < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
      `;
    } else {
      whereClause += " AND sib.invoice_date BETWEEN :start_date AND :end_date";
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    const query = `
      SELECT 
        EXTRACT(DOW FROM sib.invoice_date) AS day_of_week,
        TO_CHAR(sib.invoice_date, 'Dy') AS day_label,
        COUNT(sib.id) AS visit_count
      FROM 
        sales_invoice_bills sib
      WHERE 
        ${whereClause}
      GROUP BY 
        day_of_week, day_label
      ORDER BY 
        day_of_week ASC
    `;

    const visits = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format to ensure all days are present (Mon-Sun format as per image)
    // DOW: 0=Sun, 1=Mon, ... 6=Sat
    // We want the response to likely be ordered Mon -> Sun for the chart
    const daysMap = {
      1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun'
    };

    // Create ordered array Mon(1) to Sun(0/7)
    // Note: EXTRACT(DOW) treats 0 as Sunday. 
    // Let's normalize data.

    // We want output: Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const order = [1, 2, 3, 4, 5, 6, 0];

    const completeData = order.map(dow => {
      const found = visits.find(v => parseInt(v.day_of_week) === dow);
      return {
        day: daysMap[dow],
        visits: found ? parseInt(found.visit_count, 10) : 0
      };
    });

    return commonService.okResponse(res, {
      customer_visits: completeData,
      total_visits: completeData.reduce((sum, item) => sum + item.visits, 0)
    });

  } catch (err) {
    console.error('Error in getCustomerVisits:', err);
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
  getBranchDashboard,
  getBranchRevenueComparison,
  getBranchStats,
  getBranchDetails,
  getBranchOverview,
  getSalesStatistics,
  getCustomerVisits,
};

// Get comprehensive branch sales analytics
const getBranchSalesAnalytics = async (req, res) => {
  try {
    const { branch_id, start_date, end_date } = req.query;

    if (!branch_id) {
      return commonService.badRequest(res, "branch_id is required");
    }

    const replacements = { branch_id };
    let dateFilter = '';

    if (start_date && end_date) {
      dateFilter = 'AND sib.invoice_date BETWEEN :start_date AND :end_date';
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    // 1. Total Sales Value (for selected period)
    const salesQuery = `
      SELECT COALESCE(SUM(total_amount), 0) AS total_sales_value
      FROM sales_invoice_bills sib
      WHERE sib.branch_id = :branch_id
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${dateFilter}
    `;

    // 2. Total Weight Value (current stock weight in grams)
    const weightQuery = `
      SELECT COALESCE(SUM(remaining_weight), 0) AS total_weight_value
      FROM products
      WHERE branch_id = :branch_id
        AND deleted_at IS NULL
        AND status = 'Active'
    `;

    // 3. Total Stock Value (current stock purchase value)
    const stockValueQuery = `
      SELECT COALESCE(SUM(total_grn_value), 0) AS total_stock_value
      FROM products
      WHERE branch_id = :branch_id
        AND deleted_at IS NULL
        AND status = 'Active'
    `;

    // 4. Revenue by Payment Mode (Cash, UPI, Card)
    const revenueQuery = `
      SELECT 
        payment_mode,
        COALESCE(SUM(amount_received), 0) AS total_amount
      FROM payments p
      WHERE p.deleted_at IS NULL
        AND p.status = 'Completed'
        AND (
          EXISTS (
            SELECT 1 FROM sales_invoice_bills sib 
            WHERE sib.id = p.invoice_bill_id 
              AND sib.branch_id = :branch_id 
              AND sib.is_active = true
              ${dateFilter}
          )
          OR EXISTS (
            SELECT 1 FROM jewel_repairs jr 
            WHERE jr.id = p.jewel_repair_id AND jr.is_active = true
              AND jr.branch_id = :branch_id 
              ${dateFilter.replace(/sib\./g, 'jr.')}
          )
        )
      GROUP BY payment_mode
    `;

    // 5. Sales by Group (Sales Invoice, Repair, Scheme)
    const salesByGroupQuery = `
      SELECT 
        'Sales' AS group_name,
        COALESCE(SUM(total_amount), 0) AS total_amount
      FROM sales_invoice_bills
      WHERE branch_id = :branch_id
        AND deleted_at IS NULL
        AND is_active = true
        AND status != 'Cancelled'
        ${dateFilter}
      
      UNION ALL
      
      SELECT 
        'Repair' AS group_name,
        COALESCE(SUM(total_amount), 0) AS total_amount
      FROM jewel_repairs
      WHERE branch_id = :branch_id
        AND deleted_at IS NULL AND is_active = true
        AND status != 'Cancelled'
        ${dateFilter.replace(/sib\./g, 'jewel_repairs.')}
      
      UNION ALL
      
      SELECT 
        'Scheme' AS group_name,
        0 AS total_amount
    `;

    // 6. Stock Metrics
    // Opening Stock: Stock at the beginning of the period
    const openingStockQuery = `
      SELECT COALESCE(SUM(remaining_weight), 0) AS opening_stock
      FROM products
      WHERE branch_id = :branch_id
        AND deleted_at IS NULL
        ${start_date ? `AND created_at < :start_date` : ''}
    `;

    // Sales Stock: Weight sold during the period
    const salesStockQuery = `
      SELECT COALESCE(SUM(sibi.net_weight), 0) AS sales_stock
      FROM sales_invoice_bill_items sibi
      INNER JOIN sales_invoice_bills sib ON sib.id = sibi.invoice_bill_id
      WHERE sib.branch_id = :branch_id
        AND sibi.deleted_at IS NULL
        AND sibi.is_returned = false
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${dateFilter}
    `;

    // Old Jewel: Old jewel weight received during the period
    const oldJewelQuery = `
      SELECT COALESCE(SUM(oji.net_weight), 0) AS old_jewel_stock
      FROM old_jewel_items oji
      INNER JOIN old_jewels oj ON oj.id = oji.old_jewel_id
      WHERE oj.branch_id = :branch_id
        AND oj.is_active = true
        AND oji.deleted_at IS NULL
        AND oj.deleted_at IS NULL
        AND oj.status != 'Cancelled'
        ${dateFilter.replace(/sib\./g, 'oj.')}
    `;

    // Execute all queries
    const [
      salesResult,
      weightResult,
      stockValueResult,
      revenueResult,
      salesByGroupResult,
      openingStockResult,
      salesStockResult,
      oldJewelResult
    ] = await Promise.all([
      sequelize.query(salesQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(weightQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(stockValueQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(revenueQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(salesByGroupQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(openingStockQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(salesStockQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(oldJewelQuery, { replacements, type: sequelize.QueryTypes.SELECT })
    ]);

    // Format revenue by payment mode
    const revenueBreakdown = {
      cash: 0,
      upi: 0,
      card: 0
    };

    revenueResult.forEach(item => {
      const amount = parseFloat(item.total_amount || 0);
      if (item.payment_mode === 'Cash') revenueBreakdown.cash = amount;
      else if (item.payment_mode === 'UPI') revenueBreakdown.upi = amount;
      else if (item.payment_mode === 'Card') revenueBreakdown.card = amount;
    });

    // Format sales by group
    const salesByGroup = salesByGroupResult.map(item => ({
      group: item.group_name,
      amount: parseFloat(item.total_amount || 0).toFixed(2)
    }));

    // Calculate closing stock
    const openingStock = parseFloat(openingStockResult[0]?.opening_stock || 0);
    const salesStock = parseFloat(salesStockResult[0]?.sales_stock || 0);
    const oldJewelStock = parseFloat(oldJewelResult[0]?.old_jewel_stock || 0);
    const closingStock = openingStock - salesStock + oldJewelStock;

    // Format response
    const analytics = {
      sales_metrics: {
        total_sales_value: parseFloat(salesResult[0]?.total_sales_value || 0).toFixed(2),
        total_weight_value: parseFloat(weightResult[0]?.total_weight_value || 0).toFixed(3),
        total_stock_value: parseFloat(stockValueResult[0]?.total_stock_value || 0).toFixed(2)
      },
      revenue: {
        cash: revenueBreakdown.cash.toFixed(2),
        upi: revenueBreakdown.upi.toFixed(2),
        card: revenueBreakdown.card.toFixed(2)
      },
      sales_by_group: salesByGroup,
      stock: {
        opening_stock: openingStock.toFixed(3),
        sales_stock: salesStock.toFixed(3),
        old_jewel: oldJewelStock.toFixed(3),
        closing_stock: closingStock.toFixed(3)
      }
    };

    return commonService.okResponse(res, analytics);

  } catch (err) {
    console.error('Error in getBranchSalesAnalytics:', err);
    return commonService.handleError(res, err);
  }
};



module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
  getBranchDashboard,
  getBranchRevenueComparison,
  getBranchStats,
  getBranchDetails,
  getBranchOverview,
  getSalesStatistics,
  getCustomerVisits,
  getBranchSalesAnalytics,
};

// Get recent sales invoices for selected period
const getRecentSales = async (req, res) => {
  try {
    const { branch_id, start_date, end_date, limit = 10 } = req.query;

    const replacements = { limit: parseInt(limit, 10) };
    let whereClause = 'sib.deleted_at IS NULL AND sib.is_active = true AND sib.status != \'Cancelled\'';

    if (branch_id) {
      whereClause += ' AND sib.branch_id = :branch_id';
      replacements.branch_id = branch_id;
    }

    if (start_date && end_date) {
      whereClause += ' AND sib.invoice_date BETWEEN :start_date AND :end_date';
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    const query = `
      SELECT 
        sib.id AS invoice_id,
        sib.invoice_no,
        sib.invoice_date AS date,
        sibi.product_name_snapshot AS product_name,
        COALESCE(sibi.gross_weight, 0) AS grs_weight,
        COALESCE(sibi.net_weight, 0) AS net_weight,
        COALESCE(sibi.quantity, 0) AS quantity,
        sib.total_amount
      FROM 
        sales_invoice_bills sib
      INNER JOIN 
        sales_invoice_bill_items sibi ON sibi.invoice_bill_id = sib.id AND sibi.deleted_at IS NULL AND sibi.is_returned = false
      WHERE 
        ${whereClause}
      ORDER BY 
        sib.invoice_date DESC, sib.id DESC
      LIMIT :limit
    `;

    const recentSales = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedData = recentSales.map((item, index) => ({
      s_no: index + 1,
      date: item.date,
      id: item.invoice_id,
      invoice_no: item.invoice_no,
      invoice_id: item.invoice_id,
      product_name: item.product_name,
      grs_weight: parseFloat(item.grs_weight || 0).toFixed(2),
      net_weight: parseFloat(item.net_weight || 0).toFixed(2),
      quantity: parseInt(item.quantity, 10),
      total_amount: parseFloat(item.total_amount || 0).toFixed(2),
    }));

    return commonService.okResponse(res, {
      recent_sales: formattedData,
      total_records: formattedData.length,
    });
  } catch (err) {
    console.error('Error in getRecentSales:', err);
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
  getBranchDashboard,
  getBranchRevenueComparison,
  getBranchStats,
  getBranchDetails,
  getBranchOverview,
  getSalesStatistics,
  getCustomerVisits,
  getBranchSalesAnalytics,
  getRecentSales,
};

// Get top selling categories based on invoice counts
const getTopSellingCategories = async (req, res) => {
  try {
    const { branch_id, start_date, end_date, limit = 10 } = req.query;

    const replacements = { limit: parseInt(limit, 10) };
    let whereClause = 'sib.deleted_at IS NULL AND sib.is_active = true AND sib.status != \'Cancelled\'';

    if (branch_id) {
      whereClause += ' AND sib.branch_id = :branch_id';
      replacements.branch_id = branch_id;
    }

    if (start_date && end_date) {
      whereClause += ' AND sib.invoice_date BETWEEN :start_date AND :end_date';
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    const query = `
      SELECT 
        c.id AS category_id,
        c.category_name,
        c.category_image_url,
        COUNT(DISTINCT sib.id) AS total_invoices,
        COALESCE(SUM(sib.total_amount), 0) AS total_sales_amount
      FROM 
        categories c
      INNER JOIN 
        products p ON p.category_id = c.id AND p.deleted_at IS NULL
      INNER JOIN 
        sales_invoice_bill_items sibi ON sibi.product_id = p.id AND sibi.deleted_at IS NULL AND sibi.is_returned = false
      INNER JOIN 
        sales_invoice_bills sib ON sib.id = sibi.invoice_bill_id
      WHERE 
        c.deleted_at IS NULL
        AND c.status = 'Active'
        AND ${whereClause}
      GROUP BY 
        c.id, c.category_name, c.category_image_url
      ORDER BY 
        total_invoices DESC, total_sales_amount DESC
      LIMIT :limit
    `;

    const topCategories = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedData = topCategories.map((item) => ({
      category_id: item.category_id,
      category_name: item.category_name,
      category_image_url: item.category_image_url || null,
      total_invoices: parseInt(item.total_invoices, 10),
      total_sales_amount: parseFloat(item.total_sales_amount || 0).toFixed(2),
    }));

    return commonService.okResponse(res, {
      top_selling_categories: formattedData,
      total_results: formattedData.length,
    });
  } catch (err) {
    console.error('Error in getTopSellingCategories:', err);
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
  getBranchDashboard,
  getBranchRevenueComparison,
  getBranchStats,
  getBranchDetails,
  getBranchOverview,
  getSalesStatistics,
  getCustomerVisits,
  getBranchSalesAnalytics,
  getRecentSales,
  getTopSellingCategories,
};

// Get comprehensive stock analytics
const getStockAnalytics = async (req, res) => {
  try {
    const { branch_id, start_date, end_date } = req.query;

    if (!branch_id) {
      return commonService.badRequest(res, "branch_id is required");
    }

    const replacements = { branch_id };

    // Date filter for products created within the period
    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = 'AND p.created_at BETWEEN :start_date AND :end_date';
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    // 1. Total Quantity - Stock in hand (total products count and weight)
    const totalQuantityQuery = `
      SELECT 
        COALESCE(SUM(total_products), 0) AS total_quantity,
        COALESCE(SUM(remaining_weight), 0) AS total_weight
      FROM products p
      WHERE p.branch_id = :branch_id
        AND p.deleted_at IS NULL
        AND p.status = 'Active'
        ${dateFilter}
    `;

    // 2. Stock by Category - Bar chart data (weight by category)
    const stockByCategoryQuery = `
      SELECT 
        c.category_name,
        COALESCE(SUM(p.remaining_weight), 0) AS total_weight
      FROM categories c
      INNER JOIN products p ON p.category_id = c.id 
        AND p.branch_id = :branch_id
        AND p.deleted_at IS NULL
        AND p.status = 'Active'
        ${dateFilter}
      WHERE c.deleted_at IS NULL
        AND c.status = 'Active'
      GROUP BY c.category_name
      ORDER BY total_weight DESC
    `;

    // 3. Low Stock - Top 5 subcategories with low stock (quantity < reorder level or threshold)
    // Assuming low stock means remaining_weight is low
    const lowStockQuery = `
      SELECT 
        sc.subcategory_name,
        COALESCE(SUM(p.total_products), 0) AS quantity,
        25 AS reorder_level
      FROM subcategories sc
      INNER JOIN products p ON p.subcategory_id = sc.id 
        AND p.branch_id = :branch_id
        AND p.deleted_at IS NULL
        AND p.status = 'Active'
        ${dateFilter}
      WHERE sc.deleted_at IS NULL
        AND sc.status = 'Active'
      GROUP BY sc.id, sc.subcategory_name
      HAVING SUM(p.total_products) > 0 AND SUM(p.total_products) <= 25
      ORDER BY quantity ASC
      LIMIT 5
    `;

    // 4. Out of Stock - Top 5 subcategories with zero stock
    const outOfStockQuery = `
      SELECT 
        sc.subcategory_name,
        25 AS reorder_level
      FROM subcategories sc
      INNER JOIN products p ON p.subcategory_id = sc.id 
        AND p.branch_id = :branch_id
        AND p.deleted_at IS NULL
        ${dateFilter}
      WHERE sc.deleted_at IS NULL
        AND sc.status = 'Active'
      GROUP BY sc.id, sc.subcategory_name
      HAVING SUM(COALESCE(p.total_products, 0)) = 0
      ORDER BY sc.subcategory_name ASC
      LIMIT 5
    `;

    // Execute all queries
    const [
      totalQuantityResult,
      stockByCategoryResult,
      lowStockResult,
      outOfStockResult
    ] = await Promise.all([
      sequelize.query(totalQuantityQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(stockByCategoryQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(lowStockQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(outOfStockQuery, { replacements, type: sequelize.QueryTypes.SELECT })
    ]);

    // Format total quantity
    const totalQuantity = {
      total_quantity: parseInt(totalQuantityResult[0]?.total_quantity || 0),
      total_weight: parseFloat(totalQuantityResult[0]?.total_weight || 0).toFixed(2)
    };

    // Format stock by category for bar chart
    const stockByCategory = stockByCategoryResult.map(item => ({
      category_name: item.category_name,
      total_weight: parseFloat(item.total_weight || 0).toFixed(2)
    }));

    // Format low stock items
    const lowStock = {
      count: lowStockResult.length,
      total_weight: lowStockResult.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0).toFixed(2),
      items: lowStockResult.map(item => ({
        subcategory_name: item.subcategory_name,
        quantity: parseInt(item.quantity, 10),
        reorder_level: parseInt(item.reorder_level, 10)
      }))
    };

    // Format out of stock items
    const outOfStock = {
      count: outOfStockResult.length,
      total_weight: "0.00",
      items: outOfStockResult.map(item => ({
        subcategory_name: item.subcategory_name,
        reorder_level: parseInt(item.reorder_level, 10)
      }))
    };

    // Format response
    const analytics = {
      total_quantity: totalQuantity,
      stock_by_category: stockByCategory,
      low_stock: lowStock,
      out_of_stock: outOfStock
    };

    return commonService.okResponse(res, analytics);

  } catch (err) {
    console.error('Error in getStockAnalytics:', err);
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
  getBranchDashboard,
  getBranchRevenueComparison,
  getBranchStats,
  getBranchDetails,
  getBranchOverview,
  getSalesStatistics,
  getCustomerVisits,
  getBranchSalesAnalytics,
  getRecentSales,
  getTopSellingCategories,
  getStockAnalytics,
};

// Get vendor contribution - GRNs raised from vendors with total values
const getVendorContribution = async (req, res) => {
  try {
    const { branch_id, start_date, end_date } = req.query;

    const replacements = {};
    let whereClause = 'g.deleted_at IS NULL AND g.is_active = true';

    if (branch_id) {
      whereClause += ' AND p.branch_id = :branch_id';
      replacements.branch_id = branch_id;
    }

    if (start_date && end_date) {
      whereClause += ' AND g.grn_date BETWEEN :start_date AND :end_date';
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    }

    const query = `
      SELECT 
        v.id AS vendor_id,
        v.vendor_name,
        COUNT(DISTINCT g.id) AS total_grns,
        COALESCE(SUM(g.total_amount), 0) AS total_value
      FROM 
        vendors v
      INNER JOIN 
        grns g ON g.vendor_id = v.id AND g.deleted_at IS NULL AND g.is_active = true
      LEFT JOIN
        products p ON p.grn_id = g.id AND p.deleted_at IS NULL
      WHERE 
        v.deleted_at IS NULL
        AND v.status = 'Active'
        AND ${whereClause}
      GROUP BY 
        v.id, v.vendor_name
      ORDER BY 
        total_value DESC, total_grns DESC
    `;

    const vendorContributions = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response for bar chart
    const formattedData = vendorContributions.map((item) => ({
      vendor_id: item.vendor_id,
      vendor_name: item.vendor_name,
      total_grns: parseInt(item.total_grns, 10),
      total_value: parseFloat(item.total_value || 0).toFixed(2),
    }));

    return commonService.okResponse(res, {
      vendor_contributions: formattedData,
      total_vendors: formattedData.length,
    });
  } catch (err) {
    console.error('Error in getVendorContribution:', err);
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
  getBranchDashboard,
  getBranchRevenueComparison,
  getBranchStats,
  getBranchDetails,
  getBranchOverview,
  getSalesStatistics,
  getCustomerVisits,
  getBranchSalesAnalytics,
  getRecentSales,
  getTopSellingCategories,
  getStockAnalytics,
  getVendorContribution,
};

// Get customers associated with a branch
const getBranchCustomers = async (req, res) => {
  try {
    const { branch_id, limit = 10, offset = 0 } = req.query;

    if (!branch_id) {
      return commonService.badRequest(res, "branch_id is required");
    }

    const replacements = {
      branch_id,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    };

    // Query to get branch details with district and state information
    const branchQuery = `
      SELECT 
        b.id,
        b.branch_name,
        b.contact_person,
        b.mobile,
        b.address,
        b.pin_code,
        b.district_id,
        d.district_name,
        b.state_id,
        s.state_name
      FROM 
        branches b
      LEFT JOIN 
        districts d ON b.district_id = d.id AND d.deleted_at IS NULL
      LEFT JOIN 
        states s ON b.state_id = s.id AND s.deleted_at IS NULL
      WHERE 
        b.id = :branch_id
        AND b.deleted_at IS NULL
    `;

    const query = `
      SELECT 
        c.id AS customer_id,
        c.customer_code AS customer_no,
        c.customer_name,
        c.mobile_number,
        COUNT(DISTINCT sib.id) AS total_no_of_order,
        COALESCE(SUM(sib.total_amount), 0) AS purchase_amount
      FROM 
        customers c
      INNER JOIN 
        sales_invoice_bills sib ON sib.customer_id = c.id 
          AND sib.branch_id = :branch_id
          AND sib.deleted_at IS NULL
          AND sib.is_active = true
          AND sib.status != 'Cancelled'
      WHERE 
        c.deleted_at IS NULL
      GROUP BY 
        c.id, c.customer_code, c.customer_name, c.mobile_number
      ORDER BY 
        purchase_amount DESC, total_no_of_order DESC
      LIMIT :limit OFFSET :offset
    `;

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT c.id) AS total_count
      FROM customers c
      INNER JOIN sales_invoice_bills sib ON sib.customer_id = c.id 
        AND sib.branch_id = :branch_id
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
        AND sib.status != 'Cancelled'
      WHERE c.deleted_at IS NULL
    `;

    const [branchInfo, customers, countResult] = await Promise.all([
      sequelize.query(branchQuery, { replacements: { branch_id }, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(query, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(countQuery, { replacements: { branch_id }, type: sequelize.QueryTypes.SELECT })
    ]);

    // Format the response
    const formattedData = customers.map((item, index) => ({
      s_no: parseInt(offset, 10) + index + 1,
      customer_id: item.customer_id,
      customer_no: item.customer_no,
      customer_name: item.customer_name,
      mobile_number: item.mobile_number,
      total_no_of_order: parseInt(item.total_no_of_order, 10),
      purchase_amount: parseFloat(item.purchase_amount || 0).toFixed(2),
    }));

    // Format branch information
    const branch = branchInfo[0] || null;

    return commonService.okResponse(res, {
      branch: branch ? {
        branch_id: branch.id,
        branch_name: branch.branch_name,
        contact_person: branch.contact_person,
        mobile: branch.mobile,
        address: branch.address,
        pin_code: branch.pin_code,
        district_id: branch.district_id,
        district_name: branch.district_name,
        state_id: branch.state_id,
        state_name: branch.state_name
      } : null,
      customers: formattedData,
      total_count: parseInt(countResult[0]?.total_count || 0),
      current_page: Math.floor(parseInt(offset, 10) / parseInt(limit, 10)) + 1,
      per_page: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error in getBranchCustomers:', err);
    return commonService.handleError(res, err);
  }
};

// Get all invoices for a specific customer (across all branches)
const getCustomerInvoices = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { include_items } = req.query; // Optional: include_items=true to get detailed items

    if (!customer_id) {
      return commonService.badRequest(res, "customer_id is required");
    }

    const query = `
      SELECT 
        sib.id AS invoice_id,
        sib.invoice_no,
        sib.invoice_date,
        b.branch_name,
        sib.total_amount,
        sib.status,
        COUNT(sibi.id) AS total_items
      FROM 
        sales_invoice_bills sib
      INNER JOIN 
        branches b ON b.id = sib.branch_id AND b.deleted_at IS NULL
      LEFT JOIN 
        sales_invoice_bill_items sibi ON sibi.invoice_bill_id = sib.id AND sibi.deleted_at IS NULL AND sibi.is_returned = false
      WHERE 
        sib.customer_id = :customer_id
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
      GROUP BY 
        sib.id, sib.invoice_no, sib.invoice_date, b.branch_name, sib.total_amount, sib.status
      ORDER BY 
        sib.invoice_date DESC, sib.id DESC
    `;

    const invoices = await sequelize.query(query, {
      replacements: { customer_id },
      type: sequelize.QueryTypes.SELECT,
    });

    // Optionally fetch items with product details for each invoice
    let formattedData = invoices.map((item, index) => ({
      s_no: index + 1,
      invoice_id: item.invoice_id,
      invoice_no: item.invoice_no,
      invoice_date: item.invoice_date,
      branch_name: item.branch_name,
      total_items: parseInt(item.total_items, 10),
      total_amount: parseFloat(item.total_amount || 0).toFixed(2),
      status: item.status,
    }));

    // If include_items=true, fetch product names for each invoice
    if (include_items === 'true' && invoices.length > 0) {
      const itemsQuery = `
        SELECT 
          sibi.invoice_bill_id,
          COALESCE(p.product_name, sibi.product_name_snapshot) AS product_name
        FROM 
          sales_invoice_bill_items sibi
        LEFT JOIN 
          products p ON p.id = sibi.product_id AND p.deleted_at IS NULL
        WHERE 
          sibi.invoice_bill_id IN (:invoice_ids)
          AND sibi.deleted_at IS NULL
        ORDER BY 
          sibi.invoice_bill_id, sibi.id
      `;

      const invoice_ids = invoices.map(inv => inv.invoice_id);
      const items = await sequelize.query(itemsQuery, {
        replacements: { invoice_ids },
        type: sequelize.QueryTypes.SELECT,
      });

      // Group items by invoice_bill_id
      const itemsByInvoice = items.reduce((acc, item) => {
        if (!acc[item.invoice_bill_id]) {
          acc[item.invoice_bill_id] = [];
        }
        acc[item.invoice_bill_id].push(item.product_name);
        return acc;
      }, {});

      // Add items to each invoice
      formattedData = formattedData.map(invoice => ({
        ...invoice,
        items: itemsByInvoice[invoice.invoice_id] || [],
      }));
    }

    return commonService.okResponse(res, {
      invoices: formattedData,
      total_invoices: formattedData.length,
    });
  } catch (err) {
    console.error('Error in getCustomerInvoices:', err);
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
  getBranchDashboard,
  getBranchRevenueComparison,
  getBranchStats,
  getBranchDetails,
  getBranchOverview,
  getSalesStatistics,
  getCustomerVisits,
  getBranchSalesAnalytics,
  getRecentSales,
  getTopSellingCategories,
  getStockAnalytics,
  getVendorContribution,
  getBranchCustomers,
  getCustomerInvoices,
};

// Get vendors associated with a branch (based on visibility settings)
const getBranchVendors = async (req, res) => {
  try {
    const { branch_id } = req.query;

    if (!branch_id) {
      return commonService.badRequest(res, "branch_id is required");
    }

    const query = `
      SELECT 
        v.id AS vendor_id,
        v.vendor_code,
        v.vendor_name,
        v.proprietor_name AS contact_person,
        v.mobile AS contact_number,
        ARRAY_TO_STRING(
          ARRAY(
            SELECT mt.material_type 
            FROM "materialTypes" mt 
            WHERE mt.id = ANY(v.material_type_ids) 
              AND mt.deleted_at IS NULL
          ), 
          ', '
        ) AS material_type,
        b.branch_name
      FROM 
        vendors v
      INNER JOIN 
        branches b ON b.id = :branch_id AND b.deleted_at IS NULL
      WHERE 
        v.deleted_at IS NULL
        AND v.status = 'Active'
        AND :branch_id = ANY(v.visibilities)
      ORDER BY 
        v.vendor_name ASC
    `;

    const vendors = await sequelize.query(query, {
      replacements: { branch_id },
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedData = vendors.map((item, index) => ({
      s_no: index + 1,
      vendor_id: item.vendor_id,
      vendor_code: item.vendor_code,
      vendor_name: item.vendor_name,
      contact_person: item.contact_person,
      contact_number: item.contact_number,
      material_type: item.material_type,
      branch: item.branch_name,
    }));

    return commonService.okResponse(res, {
      vendors: formattedData,
      total_vendors: formattedData.length,
    });
  } catch (err) {
    console.error('Error in getBranchVendors:', err);
    return commonService.handleError(res, err);
  }
};

// Get payment/receipt details for a specific vendor at a branch
const getVendorPaymentDetails = async (req, res) => {
  try {
    const { vendor_id, branch_id } = req.query;

    if (!vendor_id) {
      return commonService.badRequest(res, "vendor_id is required");
    }

    if (!branch_id) {
      return commonService.badRequest(res, "branch_id is required");
    }

    const query = `
      SELECT 
        g.id AS grn_id,
        g.grn_no,
        g.grn_date AS date,
        g.total_amount AS total_purchase,
        COALESCE(SUM(vp.amount), 0) AS total_paid,
        (g.total_amount - COALESCE(SUM(vp.amount), 0)) AS outstanding
      FROM 
        grns g
      LEFT JOIN 
        vendor_payments vp ON vp.purchase_id = g.id::text 
          AND vp.branch_id = :branch_id
          AND vp.is_active = true
          AND vp.deleted_at IS NULL
          AND vp.status != 'Cancelled'
      WHERE 
        g.vendor_id = :vendor_id
        AND g.deleted_at IS NULL
        AND g.is_active = true
      GROUP BY 
        g.id, g.grn_no, g.grn_date, g.total_amount
      ORDER BY 
        g.grn_date DESC, g.id DESC
    `;

    const payments = await sequelize.query(query, {
      replacements: { vendor_id, branch_id },
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedData = payments.map((item, index) => ({
      s_no: index + 1,
      grn_id: item.grn_id,
      grn_no: item.grn_no,
      date: item.date,
      total_purchase: parseFloat(item.total_purchase || 0).toFixed(2),
      total_paid: parseFloat(item.total_paid || 0).toFixed(2),
      outstanding: parseFloat(item.outstanding || 0).toFixed(2),
    }));

    return commonService.okResponse(res, {
      payments: formattedData,
      total_records: formattedData.length,
    });
  } catch (err) {
    console.error('Error in getVendorPaymentDetails:', err);
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createBranch,
  listBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  branchDropdownList,
  generateBranchCode,
  getBranchDashboard,
  getBranchRevenueComparison,
  getBranchStats,
  getBranchDetails,
  getBranchOverview,
  getSalesStatistics,
  getCustomerVisits,
  getBranchSalesAnalytics,
  getRecentSales,
  getTopSellingCategories,
  getStockAnalytics,
  getVendorContribution,
  getBranchCustomers,
  getCustomerInvoices,
  getBranchVendors,
  getVendorPaymentDetails,
};
