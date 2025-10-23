const { models } = require("../models");
const commonService = require("./commonService");
const message = require("../constants/en.json");

const createEmployeeContact = async (req, res) => {
  try {
    const required = [
      "employee_id",
      "mobile_number",
      "email_id",
      "address",
      "country_id",
      "state_id",
      "pin_code",
      "emergency_contact_person",
      "relationship",
      "emergency_contact_number",
    ];

    for (const f of required) {
      if (req.body?.[f] === undefined || req.body?.[f] === null || req.body?.[f] === "") {
        return commonService.badRequest(res, message.failure.requiredFields);
      }
    }

    const payload = {
      employee_id: +req.body.employee_id,
      mobile_number: req.body.mobile_number,
      email_id: req.body.email_id,
      address: req.body.address,
      country_id: req.body.country_id,
      state_id: req.body.state_id,
      district_id: req.body.district_id ?? null,
      pin_code: req.body.pin_code,
      emergency_contact_person: req.body.emergency_contact_person,
      relationship: req.body.relationship,
      emergency_contact_number: req.body.emergency_contact_number,
    };

    const contact = await models.EmployeeContact.create(payload);
    return commonService.createdResponse(res, { contact });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = { createEmployeeContact };
