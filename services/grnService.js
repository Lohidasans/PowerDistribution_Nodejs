const { models } = require("../models/index");
const commonService = require("../services/commonService");


// GET: minimal list of GRN numbers for dropdowns
const listGrnNumbers = async (req, res) => {
  try {
    const rows = await models.Grn.findAll({
      attributes: ["id", "grn_no"],
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { grns: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = { listGrnNumbers };
