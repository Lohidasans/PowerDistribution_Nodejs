const { models, sequelize } = require("../models");
const { Op } = require("sequelize");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const bankSvc = require("./bankAccountService");
const userSvc = require("./userLoginService");
const kycSvc = require("./kycDocumentService");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

const createEmployee = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      profile_image_url,
      employee_no,
      employee_name,
      department_id,
      role_id,
      joining_date,
      employment_type,
      gender,
      date_of_birth,
      branch_id,
      status,
      contact,
      bank_account,
      kyc_documents,
      login,
      experiences,
    } = req.body;

    // List and list required fields
    const requiredFields = { employee_no, employee_name, department_id, role_id};
    const missingFields = Object.keys(requiredFields).filter(key => !requiredFields[key]);

    if (missingFields.length > 0) {
      await transaction.rollback();
      return commonService.badRequest(res,`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Check if employee_no already exists among non-deleted employees
    const existingEmployee = await models.Employee.findOne({
      where: {
        employee_no,
        deleted_at: null,     // only check active (non-deleted) records
      }
    });

    if (existingEmployee) {
      await transaction.rollback();
      return commonService.badRequest(res, "Employee number already exists.");
    }
    // Create employee
    const employee = await models.Employee.create(
      {
        profile_image_url,
        employee_no,
        employee_name,
        department_id,
        role_id,
        joining_date,
        employment_type,
        gender,
        date_of_birth,
        branch_id,
        status,
      },
      { transaction }
    );

    // Create contact if provided
    let createdContact = null;
    if (contact && typeof contact === "object") {
      createdContact = await createEmployeeContact(
        employee.id,
        contact,
        transaction
      );
    }

    // Optional: Bank Account via helper
    let createdBankAccount = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        createdBankAccount = await bankSvc.createBankAccountByEntity(transaction, "employee", employee.id, bank_account);
      } catch (e) {
        await transaction.rollback();
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
    }

    // Optional: KYC
    let createdKycDocs = [];
    if (Array.isArray(kyc_documents) && kyc_documents.length > 0) {
      createdKycDocs = await kycSvc.createKycByEntity(transaction, "employee", employee.id, kyc_documents);
    }

    // Optional: Login via helper
    let createdUser = null;

    if (login && typeof login === "object") {
      const result = await userSvc.createUserByEntity(transaction, "employee", employee.id, login);
      if (result.error) {
        await transaction.rollback();
        return commonService.badRequest(res, result.error);
      }

      createdUser = result.user;
    }


    // Optional: Experiences
    let createdExperiences = [];
    if (Array.isArray(experiences) && experiences.length > 0) {
      createdExperiences = await createEmployeeExperiences(transaction, employee.id, experiences);
    }

    await transaction.commit();

    const response = {
      employee: {
        ...employee.get({ plain: true }),
        contacts: createdContact ? createdContact.get({ plain: true }) : null,
      },
      bank_account: createdBankAccount,
      kyc_documents: createdKycDocs,
      login: createdUser,
      experiences: createdExperiences,
    };

    return commonService.createdResponse(res, response);
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

const createEmployeeContact = async (
  employeeId,
  contactData,
  transaction = null
) => {
  const contact = await models.EmployeeContact.create(
    {
      employee_id: employeeId,
      mobile_number: contactData.mobile_number,
      email_id: contactData.email_id,
      address: contactData.address,
      country_id: contactData.country_id,
      state_id: contactData.state_id,
      district_id: contactData.district_id,
      pin_code: contactData.pin_code,
      emergency_contact_person: contactData.emergency_contact_person,
      relationship: contactData.relationship,
      emergency_contact_number: contactData.emergency_contact_number,
    },
    transaction ? { transaction } : {}
  );

  return contact;
};

// Helpers: Experiences
const createEmployeeExperiences = async (transaction, employee_id, experiences) => {
  const rows = experiences.map((e) => ({
    employee_id,
    organization_name: e.organization_name,
    role: e.role,
    duration_from: e.duration_from,
    duration_to: e.duration_to,
    location: e.location ?? null,
  }));
  if (!rows.length) return [];
  return models.EmployeeExperience.bulkCreate(rows, { transaction, returning: true });
};

const updateEmployeeExperiences = async (transaction, employee_id, experiences) => {
  // Update-only: require id for each experience to update
  const updated = [];
  if (!Array.isArray(experiences) || !experiences.length) return updated;
  for (const exp of experiences) {
    if (!exp.id) continue;
    const row = await models.EmployeeExperience.findOne({ where: { id: exp.id, employee_id }, transaction });
    if (!row) continue;
    await row.update(
      {
        organization_name: exp.organization_name ?? row.organization_name,
        role: exp.role ?? row.role,
        duration_from: exp.duration_from ?? row.duration_from,
        duration_to: exp.duration_to ?? row.duration_to,
        location: exp.location ?? row.location,
      },
      { transaction }
    );
    updated.push(row);
  }
  return updated;
};

// List employees with optional simple filters
const listEmployees = async (req, res) => {
  try {
    const { branch_id, department_id, role_id, status, search } = req.query;

    let query = `
      SELECT
        e.*,
        b.branch_name,
        d.department_name,
        des.role_name as designation_name,
        c.mobile_number,
        c.email_id,
        c.address,
        c.country_id,
        c.state_id,
        c.district_id,
        c.pin_code,
        c.emergency_contact_person,
        c.relationship,
        c.emergency_contact_number,
        coun.country_name,
        s.state_name,
        dist.district_name
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN "employee_departments" d ON d.id = e.department_id
      LEFT JOIN "roles" des ON des.id = e.role_id
      LEFT JOIN employee_contacts c ON c.employee_id = e.id
      LEFT JOIN countries coun ON coun.country_name = c.country_id
      LEFT JOIN states s ON s.state_name = c.state_id
      LEFT JOIN districts dist ON dist.district_name = c.district_id
      WHERE e.deleted_at IS NULL
    `;

    const replacements = {};

    if (branch_id) {
      query += ` AND e.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }
    if (department_id) {
      query += ` AND e.department_id = :department_id`;
      replacements.department_id = department_id;
    }
    if (role_id) {
      query += ` AND e.role_id = :role_id`;
      replacements.role_id = role_id;
    }
    if (status) {
      query += ` AND e.status = :status`;
      replacements.status = status;
    }
    if (search) {
      query += ` AND (e.employee_name ILIKE :search OR e.employee_no ILIKE :search)`;
      replacements.search = `%${search}%`;
    }

    query += ` ORDER BY e.employee_name ASC`;

    // Sequelize query
    const rows = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Get employee counts
    let countQuery = `
      SELECT 
        COUNT(*) as total_employee_count,
        COUNT(CASE WHEN e.status = 'Active' THEN 1 END) as active_employee_count,
        COUNT(CASE WHEN e.status = 'Inactive' THEN 1 END) as inactive_employee_count
      FROM employees e
      WHERE e.deleted_at IS NULL
    `;

    const countReplacements = {};

    if (branch_id) {
      countQuery += ` AND e.branch_id = :branch_id`;
      countReplacements.branch_id = branch_id;
    }
    if (department_id) {
      countQuery += ` AND e.department_id = :department_id`;
      countReplacements.department_id = department_id;
    }
    if (role_id) {
      countQuery += ` AND e.role_id = :role_id`;
      countReplacements.role_id = role_id;
    }
    if (status) {
      countQuery += ` AND e.status = :status`;
      countReplacements.status = status;
    }
    if (search) {
      countQuery += ` AND (e.employee_name ILIKE :search OR e.employee_no ILIKE :search)`;
      countReplacements.search = `%${search}%`;
    }

    const [countResult] = await sequelize.query(countQuery, {
      replacements: countReplacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Nest contact info
    const employees = rows.map((emp) => ({
      ...emp,
      contacts: {
        mobile_number: emp.mobile_number,
        email_id: emp.email_id,
        address: emp.address,
        country_id: emp.country_id,
        state_id: emp.state_id,
        district_id: emp.district_id,
        pin_code: emp.pin_code,
        emergency_contact_person: emp.emergency_contact_person,
        relationship: emp.relationship,
        emergency_contact_number: emp.emergency_contact_number,
        country_name: emp.country_name,
        state_name: emp.state_name,
        district_name: emp.district_name,
      },
    }));

    return commonService.okResponse(res, {
      employees,
      total_employee_count: parseInt(countResult.total_employee_count) || 0,
      active_employee_count: parseInt(countResult.active_employee_count) || 0,
      inactive_employee_count: parseInt(countResult.inactive_employee_count) || 0,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Lightweight search dropdown: by employee_name/employee_no/mobile_number (joins employee_contacts)
const searchEmployeeDropdown = async (req, res) => {
  try {
    const { search = "", limit = 20 } = req.query || {};

    let sql = `
      SELECT 
        e.id,
        e.employee_no,
        e.employee_name,
        ec.mobile_number
      FROM employees e
      LEFT JOIN employee_contacts ec ON ec.employee_id = e.id AND ec.deleted_at IS NULL
      WHERE e.deleted_at IS NULL
    `;
    const replacements = {};
    if (search && String(search).trim() !== "") {
      sql += ` AND (e.employee_name ILIKE :s OR e.employee_no ILIKE :s OR ec.mobile_number ILIKE :s)`;
      replacements.s = `%${search}%`;
    }
    sql += ` ORDER BY e.employee_name ASC LIMIT :lim`;
    replacements.lim = Math.min(parseInt(limit) || 20, 50);

    const [rows] = await sequelize.query(sql, { replacements });

    const employees = rows.map((r) => ({
      id: r.id,
      employee_no: r.employee_no,
      employee_name: r.employee_name,
      mobile_number: r.mobile_number || null,
    }));

    return commonService.okResponse(res, { employees });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Dropdown: Employee Designations -> [{ id, name }]
const listDesignationDropdown = async (req, res) => {
  try {
    const rows = await models.EmployeeDesignation.findAll({
      attributes: ["id", ["designation_name", "name"]],
      order: [["designation_name", "ASC"]],
    });
    return commonService.okResponse(res, { designations: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Dropdown: Employee Departments -> [{ id, name }]
const listDepartmentDropdown = async (req, res) => {
  try {
    const rows = await models.EmployeeDepartment.findAll({
      attributes: ["id", ["department_name", "name"]],
      order: [["department_name", "ASC"]],
    });
    return commonService.okResponse(res, { departments: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getEmployeeById = async (req, res) => {
  try {
    const id = req.params.id;

    const query = `
      SELECT
        e.*,
        b.branch_name,
        d.department_name,
        r.role_name,
        c.id as contact_id,
        c.mobile_number,
        c.email_id,
        c.address,
        c.country_id,
        c.state_id,
        c.district_id,
        c.pin_code,
        c.emergency_contact_person,
        c.relationship,
        c.emergency_contact_number,
        coun.country_name,
        s.state_name,
        dist.district_name
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN "employee_departments" d ON d.id = e.department_id
      LEFT JOIN "roles" r ON r.id = e.role_id
      LEFT JOIN employee_contacts c ON c.employee_id = e.id
      LEFT JOIN countries coun ON coun.country_name = c.country_id
      LEFT JOIN states s ON s.state_name = c.state_id
      LEFT JOIN districts dist ON dist.district_name = c.district_id
      WHERE e.id = :id AND e.deleted_at IS NULL
    `;

    const [employeeRows] = await sequelize.query(query, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    });

    if (!employeeRows) {
      return commonService.notFound(res, enMessage.failure.notFound);
    }

    const [bank_account, kyc_documents, login, experiences] = await Promise.all([
      models.BankAccount.findOne({
        where: { entity_type: "employee", entity_id: id },
      }),
      models.KycDocument.findAll({
        where: { entity_type: "employee", entity_id: id },
      }),
      models.User.findOne({
        where: { entity_type: "employee", entity_id: id },
      }),
      models.EmployeeExperience.findAll({
        where: { employee_id: id },
      }),
    ]);

    // Structure the employee data with nested contacts
    const employee = {
      ...employeeRows,
      contacts: employeeRows.contact_id ? {
        id: employeeRows.contact_id,
        mobile_number: employeeRows.mobile_number,
        email_id: employeeRows.email_id,
        address: employeeRows.address,
        country_id: employeeRows.country_id,
        state_id: employeeRows.state_id,
        district_id: employeeRows.district_id,
        pin_code: employeeRows.pin_code,
        emergency_contact_person: employeeRows.emergency_contact_person,
        relationship: employeeRows.relationship,
        emergency_contact_number: employeeRows.emergency_contact_number,
        country_name: employeeRows.country_name,
        state_name: employeeRows.state_name,
        district_name: employeeRows.district_name,
      } : null,
    };

    // Remove contact fields from the main employee object
    delete employee.contact_id;
    delete employee.mobile_number;
    delete employee.email_id;
    delete employee.address;
    delete employee.country_id;
    delete employee.state_id;
    delete employee.district_id;
    delete employee.pin_code;
    delete employee.emergency_contact_person;
    delete employee.relationship;
    delete employee.emergency_contact_number;
    delete employee.country_name;
    delete employee.state_name;
    delete employee.district_name;

    return commonService.okResponse(res, {
      employee,
      bank_account,
      kyc_documents,
      login,
      experiences,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


const listEmployeeDropdown = async (req, res) => {
  try {
    const { branch_id, department_id, role_id } = req.query;

    const where = { deleted_at: null };
    if (branch_id) where.branch_id = branch_id;
    if (department_id) where.department_id = department_id;
    if (role_id) where.role_id = role_id;

    const employees = await models.Employee.findAll({
      attributes: ["id", "employee_name"],
      where,
      order: [["employee_name", "ASC"]],
    });

    return commonService.okResponse(res, { employees });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateEmployee = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const employee = await models.Employee.findByPk(id);
    if (!employee) {
      await transaction.rollback();
      return commonService.notFound(res, enMessage.failure.notFound);
    }

    const {
      profile_image_url,
      employee_name,
      department_id,
      role_id,
      joining_date,
      employment_type,
      gender,
      date_of_birth,
      branch_id,
      status,
      contact,
      bank_account,
      kyc_documents,
      login,
      experiences,
    } = req.body;

    await employee.update(
      {
        profile_image_url,
        employee_name,
        department_id,
        role_id,
        joining_date,
        employment_type,
        gender,
        date_of_birth,
        branch_id,
        status,
      },
      { transaction }
    );
    

    let updatedContact = null;
    if (contact && typeof contact === "object") {
      const existingContact = await models.EmployeeContact.findOne({
        where: { employee_id: id },
      });
      if (existingContact) {
        updatedContact = await existingContact.update(contact, { transaction });
      } else {
        updatedContact = await createEmployeeContact(id, contact, transaction);
      }
    }

    // Bank account upsert via helper
    let upsertedBank = null;
    if (bank_account && typeof bank_account === "object") {
      try {
        upsertedBank = await bankSvc.updateBankAccountByEntity(transaction, "employee", employee.id, bank_account);
      } catch (e) {
        await transaction.rollback();
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
    }

    // KYC via reusable update helper (update-only)
    let updatedKyc = [];
    if (Array.isArray(kyc_documents)) {
      updatedKyc = await kycSvc.updateKycByEntity(transaction, "employee", employee.id, kyc_documents);
    }

    // Login upsert via helper
    let upsertedUser = null;
    if (login && typeof login === "object") {
      try {
        upsertedUser = await userSvc.updateUserByEntity(transaction, "employee", employee.id, login);
      } catch (e) {
        await transaction.rollback();
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
    }

    // Experiences update-only
    let updatedExperiences = [];
    if (Array.isArray(experiences)) {
      updatedExperiences = await updateEmployeeExperiences(transaction, employee.id, experiences);
    }

    await transaction.commit();

    const response = {
      employee: {
        ...employee.get({ plain: true }),
        contacts: updatedContact ? updatedContact.get({ plain: true }) : null,
      },
      bank_account: upsertedBank,
      kyc_documents: updatedKyc,
      login: upsertedUser,
      experiences: updatedExperiences,
    };

    return commonService.okResponse(res, response);
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

const deleteEmployee = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const employee = await models.Employee.findByPk(id);

    if (!employee) {
      await t.rollback();
      return commonService.notFound(res, enMessage.failure.notFound);
    }

    // Delete ancillary records
    await models.BankAccount.destroy({ where: { entity_type: "employee", entity_id: id }, transaction: t });
    await models.KycDocument.destroy({ where: { entity_type: "employee", entity_id: id }, transaction: t });
    await models.User.destroy({ where: { entity_type: "employee", entity_id: id }, transaction: t });
    await models.EmployeeExperience.destroy({ where: { employee_id: id }, transaction: t });
    await models.EmployeeContact.destroy({ where: { employee_id: id }, transaction: t });

    await employee.destroy({ transaction: t });

    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const generateEmployeeCode = async (req, res) => {
  try {
    const { prefix} = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Employee,
      "employee_no",
      String(prefix).toUpperCase(),
      { pad: 3}
    );
    return commonService.okResponse(res, { employee_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createEmployee,
  listEmployees,
  getEmployeeById,
  listEmployeeDropdown,
  searchEmployeeDropdown,
  listDesignationDropdown,
  listDepartmentDropdown,
  updateEmployee,
  deleteEmployee,
  generateEmployeeCode,
};