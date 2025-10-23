const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const generateAutoCode = require("../helpers/codeGeneration");

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
      material_type_ids,
      visibilities,
      status,
    } = req.body;

    if (!vendor_code || !vendor_name || !email) {
      return commonService.badRequest(
        res,
        message.vendor.required
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
      material_type_ids,
      visibilities,
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

    // Base SQL with array joins and aggregation
    let query = `
      SELECT 
        v.id,
        v.vendor_code,
        v.vendor_name,
        v.proprietor_name,
        v.mobile,
        v.vendor_image_url,
        v.email,
        v.country_id,
        v.state_id,
        v.district_id,
        v.visibilities,
        (
          SELECT COALESCE(
            json_agg(json_build_object('id', mt.id, 'name', mt.material_type) ORDER BY array_position(v.material_type_ids, mt.id)),
            '[]'::json
          )
          FROM "materialTypes" mt
          WHERE mt.id = ANY(v.material_type_ids)
        ) AS material_types_detailed,
        (
          SELECT COALESCE(
            json_agg(json_build_object('id', b2.id, 'name', b2.branch_name) ORDER BY array_position(v.visibilities, b2.id)),
            '[]'::json
          )
          FROM branches b2
          WHERE b2.id = ANY(v.visibilities)
        ) AS visibilities_names_detailed
      FROM vendors v
      LEFT JOIN branches b ON b.id = ANY(v.visibilities)
      LEFT JOIN "materialTypes" m ON m.id = ANY(v.material_type_ids)
      WHERE 1=1`;

    const replacements = {};

    // Apply filters
    if (materialType) {
      query += ` AND m.material_type ILIKE :materialType`;
      replacements.materialType = `%${materialType}%`;
    }

    if (search) {
      const fields = [
        "v.vendor_name", "v.proprietor_name", "v.mobile", "v.email", "m.material_type"];
      query += ` AND (${fields.map(field => `${field} ILIKE :search`).join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    query += ` GROUP BY v.id ORDER BY v.vendor_name ASC`;

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
      return commonService.notFound(res, message.vendor.notFound);
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
      return commonService.notFound(res, message.vendor.notFound);
    }
    
    if (!req.body.vendor_name || !req.body.email) {
      return commonService.badRequest(res, message.vendor.required);
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
      return commonService.notFound(res, message.vendor.notFound);
    }

    await vendor.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateVendorCode = async (req, res) => {
  try {
    const code = await generateAutoCode(models.Vendor, "vendor_code", "VEN");
    return commonService.okResponse(res, { vendor_code: code });
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
  generateVendorCode
};
