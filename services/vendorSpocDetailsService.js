const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

// Bulk create vendor contacts
const createVendorContact = async (req, res) => {
  try {
    const { vendor_id, contacts } = req.body || {};
    if (!vendor_id || !Array.isArray(contacts) || contacts.length === 0) {
      return commonService.badRequest(res, enMessage.failure.requiredFields);
    }

    const payloads = contacts.map((c) => ({
      vendor_id,
      contact_name: c.contact_name ?? null,
      designation: c.designation ?? null,
      mobile: c.mobile ?? null,
    }));

    const rows = await models.VendorSpocDetails.bulkCreate(payloads);
    return commonService.createdResponse(res, { VendorSpocDetails: rows });
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

// Replace all contacts for a vendor (update-by-vendor, upsert by id)
const updateVendorContactsByVendor = async (req, res) => {
  const { vendor_id } = req.params;
  const { contacts } = req.body || {};
  if (!vendor_id || !Array.isArray(contacts)) {
    return commonService.badRequest(res, enMessage.failure.requiredFields);
  }

  const tx = await sequelize.transaction();
  try {
    // Upsert incoming only (no deletions)
    const payloads = contacts.map((c) => ({
      id: c.id ?? undefined,
      vendor_id,
      contact_name: c.contact_name ?? null,
      designation: c.designation ?? null,
      mobile: c.mobile ?? null,
    }));

    const rows = payloads.length
      ? await models.VendorSpocDetails.bulkCreate(payloads, {
          updateOnDuplicate: ["contact_name", "designation", "mobile", "vendor_id", "updated_at"],
          transaction: tx,
        })
      : [];
    await tx.commit();
    return commonService.okResponse(res, { VendorSpocDetails: rows });
  } catch (err) {
    await tx.rollback();
    return commonService.handleError(res, err);
  }
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
  updateVendorContactsByVendor,
};
