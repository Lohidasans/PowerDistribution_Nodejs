const { sequelize, models } = require("../models/index");
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
    const { materialType, search } = req.query;

    // Base SQL query
    let query = `
      SELECT 
        v.id, v.vendor_code, v.vendor_name, v.proprietor_name, v.mobile AS vendor_mobile,
        b.branch_name, b.contact_person, b.mobile AS branch_mobile,
        m.material_type
      FROM vendors v
      LEFT JOIN branches b ON b.id = v.branch_id
      LEFT JOIN "materialTypes" m ON m.id = v.material_type_id
      WHERE 1=1`;

    const replacements = {};

    // Apply filters
    if (materialType) {
      query += ` AND m.material_type ILIKE :materialType`;
      replacements.materialType = `%${materialType}%`;
    }

    if (search) {
      const fields = [
        "v.vendor_name", "v.proprietor_name", "v.mobile",
        "b.branch_name", "b.contact_person", "b.mobile", "m.material_type"
      ];
      query += ` AND (${fields.map(field => `${field} ILIKE :search`).join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    query += ` ORDER BY v.vendor_name ASC`;

    const [vendors] = await sequelize.query(query, { replacements });

    return commonService.okResponse(res, { vendors });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listVendorDropdown = async (req, res) => {
  try {
    const vendors = await models.Vendor.findAll({
      attributes: ["id", "vendor_name"],
      where: { deleted_at: null },
      order: [["vendor_name", "ASC"]],
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
  listVendorDropdown,
  getVendorById,
  updateVendor,
  deleteVendor,
};
