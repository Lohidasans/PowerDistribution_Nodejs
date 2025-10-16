const { models } = require("../models/index");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

const createVendorContact = async (req, res) => {
  try {
    const { vendor_id, contact_name, designation, mobile } = req.body;

    if (!vendor_id) {
      return commonService.badRequest(res, enMessage.failure.requiredFields);
    }

    const row = await models.VendorSpocDetails.create({
      vendor_id,
      contact_name,
      designation,
      mobile,
    });

    return commonService.createdResponse(res, { VendorSpocDetails: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listVendorContacts = async (req, res) => {
  try {
    const { vendor_id } = req.query;
    const where = {};
    if (vendor_id) where.vendor_id = vendor_id;

    const items = await models.VendorSpocDetails.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { VendorSpocDetails: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getVendorContactById = async (req, res) => {
  const entity = await commonService.findById(
    models.VendorSpocDetails,
    req.params.id,
    res
  );
  if (!entity) return;
  return commonService.okResponse(res, { VendorSpocDetails: entity });
};

const deleteVendorContact = async (req, res) => {
  const entity = await commonService.findById(
    models.VendorSpocDetails,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createVendorContact,
  listVendorContacts,
  getVendorContactById,
  deleteVendorContact,
};
