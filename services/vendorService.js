const { models } = require("../models/index");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

const createVendor = async (req, res) => {
  try {
    const {
      vendor_image_url,
      vendor_code,
      vendor_name,
      proprietor_name,
      email,
      mobile,
      pan_no,
      gst_no,
      address,
      country,
      state,
      district,
      pin_code,
      opening_balance,
      opening_balance_type,
      payment_terms,
      material_type,
      branch_id,
      visibility,
      status,
    } = req.body;

    if (!vendor_code || !vendor_name || !email) {
      return commonService.badRequest(
        res,
        "vendor_code, vendor_name and email are required"
      );
    }

    const vendor = await models.Vendor.create({
      vendor_image_url,
      vendor_code,
      vendor_name,
      proprietor_name,
      email,
      mobile,
      pan_no,
      gst_no,
      address,
      country,
      state,
      district,
      pin_code,
      opening_balance,
      opening_balance_type,
      payment_terms,
      material_type,
      branch_id,
      visibility,
      status,
    });

    return commonService.createdResponse(res, { vendor });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listVendors = async (req, res) => {
  try {
    const vendors = await models.Vendor.findAll({
      where: { deleted_at: null },
      order: [["id", "DESC"]],
    });
    return commonService.okResponse(res, { vendors });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await models.Vendor.findByPk(id);
    if (!vendor) {
      return commonService.notFound(res, "Vendor not found");
    }
    return commonService.okResponse(res, { vendor });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await models.Vendor.findByPk(id);
    if (!vendor) {
      return commonService.notFound(res, "Vendor not found");
    }

    await vendor.update(req.body);
    return commonService.okResponse(res, { vendor });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await models.Vendor.findByPk(id);
    if (!vendor) {
      return commonService.notFound(res, "Vendor not found");
    }

    await vendor.destroy();
    return commonService.okResponse(res, {
      message: "Vendor deleted successfully",
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createVendor,
  listVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
};
