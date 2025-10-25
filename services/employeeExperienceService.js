const { models } = require("../models");
const commonService = require("./commonService");
const message = require("../constants/en.json");


// Bulk create employee experiences
const createEmployeeExperiences = async (req, res) => {
  try {
    const { employee_id, experiences } = req.body || {};
    if (
      !employee_id ||
      !Array.isArray(experiences) ||
      experiences.length === 0
    ) {
      return commonService.badRequest(res, message.failure.requiredFields);
    }

    // Basic validation for each item
    for (const exp of experiences) {
      const required = [
        "organization_name",
        "role",
        "duration_from",
        "duration_to",
      ];
      for (const f of required) {
        if (exp?.[f] === undefined || exp?.[f] === null || exp?.[f] === "") {
          return commonService.badRequest(res, message.failure.requiredFields);
        }
      }
    }

    const payloads = experiences.map((e) => ({
      employee_id: +employee_id,
      organization_name: e.organization_name,
      role: e.role,
      duration_from: e.duration_from,
      duration_to: e.duration_to,
      location: e.location ?? null,
    }));

    const created = await models.EmployeeExperience.bulkCreate(payloads);
    return commonService.createdResponse(res, { experiences: created });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getAllEmployeeExperiences = async (req, res) => {
  try {
    const { employee_id } = req.query;
    const where = {};

    if (employee_id) {
      where.employee_id = employee_id;
    }

    const experiences = await models.EmployeeExperience.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    if (!experiences.length) {
      return commonService.notFound(res, message.failure.notFound);
    }

    return commonService.okResponse(res, experiences, message.success.fetched);
  } catch (error) {
    console.error(error);
    return commonService.internalServerError(res, error.message);
  }
};

const getEmployeeExperienceById = async (req, res) => {
  try {
    const { id } = req.params;

    const experience = await models.EmployeeExperience.findByPk(id);

    if (!experience) {
      return commonService.notFound(res, message.failure.notFound);
    }

    return commonService.okResponse(res, { experience });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateEmployeeExperience = async (req, res) => {
  try {
    const { id } = req.params;
    const { organization_name, role, duration_from, duration_to, location } =
      req.body;

    const experience = await models.EmployeeExperience.findByPk(id);
    if (!experience) {
      return commonService.notFound(res, message.failure.notFound);
    }

    await experience.update({
      organization_name,
      role,
      duration_from,
      duration_to,
      location,
    });

    return commonService.okResponse(res, {
      message: message.success.updated,
      experience,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteEmployeeExperience = async (req, res) => {
  try {
    const { id } = req.params;

    const experience = await models.EmployeeExperience.findByPk(id);
    if (!experience) {
      return commonService.notFound(res, message.failure.notFound);
    }

    await experience.destroy();

    return commonService.okResponse(res, {
      message: enMessage.success.deleted,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listEmployeeExperienceDropdown = async (req, res) => {
  try {
    const { employee_id } = req.query;

    const where = {};
    if (employee_id) where.employee_id = employee_id;

    const experiences = await models.EmployeeExperience.findAll({
      attributes: ["id", "organization_name"],
      where,
      order: [["organization_name", "ASC"]],
    });

    if (!experiences.length) {
      return commonService.notFound(res, message.failure.notFound);
    }

    const dropdown = experiences.map((exp) => ({
      id: exp.id,
      name: exp.organization_name,
    }));

    return commonService.okResponse(res, { dropdown });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createEmployeeExperiences,
  getAllEmployeeExperiences,
  getEmployeeExperienceById,
  updateEmployeeExperience,
  deleteEmployeeExperience,
  listEmployeeExperienceDropdown,
};
