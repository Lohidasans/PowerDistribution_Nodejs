const { models } = require("../models");
const commonService = require("./commonService");
const message = require("../constants/en.json");

// Bulk create employee experiences
const bulkCreateExperiences = async (req, res) => {
  try {
    const { employee_id, experiences } = req.body || {};
    if (!employee_id || !Array.isArray(experiences) || experiences.length === 0) {
      return commonService.badRequest(res, message.failure.requiredFields);
    }

    // Basic validation for each item
    for (const exp of experiences) {
      const required = ["organization_name", "role", "duration_from", "duration_to"];
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

module.exports = { bulkCreateExperiences };
