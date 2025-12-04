const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const kycSvc = require("./kycDocumentService");
const bankSvc = require("./bankAccountService");
const userSvc = require("./userLoginService");
const spocSvc = require("./vendorSpocDetailsService");

const createVendor = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { bank_account, kyc_documents, login, spoc_details, ...payload } =
      req.body || {};

    const { vendor_code, vendor_name } = payload;
    if (!vendor_code || !vendor_name) {
      await t.rollback();
      return commonService.badRequest(res, message.vendor.required);
    }
    // CHECK for duplicate vendor_code before creating vendor
    const existingVendor = await models.Vendor.findOne({
      where: { vendor_code },
    });
    if (existingVendor) {
      console.log("Duplicate vendor_code found:", vendor_code);
      await t.rollback();
      return commonService.badRequest(res, "Vendor Code already exists.");
    }

    const vendor = await models.Vendor.create(payload, { transaction: t });

    // Bank account (optional) via helper
    let createdBankAccount = [];
    if (
      bank_account &&
      typeof bank_account === "object" &&
      Object.keys(bank_account).length > 0
    ) {
      try {
        createdBankAccount = await bankSvc.createBankAccountByEntity(
          t,
          "vendor",
          vendor.id,
          bank_account
        );
      } catch (e) {
        await t.rollback();
        return commonService.badRequest(res, "Bank Account already exists");
      }
    }

    // KYC docs (optional) via reusable create helper
    let createdKycDocs = [];
    if (Array.isArray(kyc_documents) && kyc_documents.length > 0) {
      createdKycDocs = await kycSvc.createKycByEntity(
        t,
        "vendor",
        vendor.id,
        kyc_documents
      );
    }

    // Login (optional) via reusable create helper
    let createdUser = null;
    if (login && typeof login === "object" && Object.keys(login).length > 0) {
      const result = await userSvc.createUserByEntity(t, "vendor", vendor.id, login);

      if (result.error) {
        await t.rollback();
        return commonService.badRequest(res, result.error);
      }
      createdUser = result.user;
    }

    let createdSpocs = [];
    if (Array.isArray(spoc_details) && spoc_details.length) {
      createdSpocs = await spocSvc.createVendorSpocsByVendor(
        t,
        vendor.id,
        spoc_details
      );
    }

    await t.commit();
    return commonService.createdResponse(res, {
      vendor,
      bank_account: createdBankAccount,
      kyc_documents: createdKycDocs,
      login: createdUser,
      spoc_details: createdSpocs,
    });
  } catch (err) {
    await t.rollback();
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
        "v.vendor_name",
        "v.proprietor_name",
        "v.mobile",
        "v.email",
        "m.material_type",
      ];
      query += ` AND (${fields
        .map((field) => `${field} ILIKE :search`)
        .join(" OR ")})`;
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
      attributes: ["id", "vendor_name", "vendor_code", "state_id"],
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

    const [bank_account, kyc_documents, login, spoc_details] =
      await Promise.all([
        models.BankAccount.findOne({
          where: { entity_type: "vendor", entity_id: id },
        }),
        models.KycDocument.findAll({
          where: { entity_type: "vendor", entity_id: id },
        }),
        models.User.findOne({
          where: { entity_type: "vendor", entity_id: id },
        }),
        models.VendorSpocDetails.findOne({ where: { vendor_id: id } }),
      ]);

    return commonService.okResponse(res, {
      vendor,
      bank_account,
      kyc_documents,
      login,
      spoc_details,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateVendor = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const vendor = await models.Vendor.findByPk(id);
    if (!vendor) {
      await t.rollback();
      return commonService.notFound(res, message.vendor.notFound);
    }

    const { bank_account, kyc_documents, login, spoc_details, ...payload } =
      req.body || {};

    // Update vendor basic fields
    await vendor.update(payload, { transaction: t });

    /* -------------------------------------------------------
     * 1️⃣ BANK ACCOUNT: UPSERT (update if exists, create if not)
     * ------------------------------------------------------- */
    let upsertedBank = null;
    if (bank_account && typeof bank_account === "object") {
      const existingBank = await models.BankAccount.findOne({
        where: { entity_type: "vendor", entity_id: vendor.id },
      });

      try {
        if (existingBank) {
          upsertedBank = await bankSvc.updateBankAccountByEntity(
            t,
            "vendor",
            vendor.id,
            bank_account
          );
        } else {
          upsertedBank = await bankSvc.createBankAccountByEntity(
            t,
            "vendor",
            vendor.id,
            bank_account
          );
        }
      } catch (e) {
        await t.rollback();
        return commonService.badRequest(res, "Bank Account already exists.");
      }
    }

    /* -------------------------------------------------------
     * 2️⃣ KYC DOCUMENTS: UPSERT
     * ------------------------------------------------------- */
    let updatedOrCreatedKyc = [];
    if (Array.isArray(kyc_documents)) {
      const existingKyc = await models.KycDocument.findAll({
        where: { entity_type: "vendor", entity_id: vendor.id },
      });

      if (existingKyc.length === 0) {
        updatedOrCreatedKyc = await kycSvc.createKycByEntity(
          t,
          "vendor",
          vendor.id,
          kyc_documents
        );
      } else {
        updatedOrCreatedKyc = await kycSvc.updateKycByEntity(
          t,
          "vendor",
          vendor.id,
          kyc_documents
        );
      }
    }

    /* -------------------------------------------------------
     * 3️⃣ LOGIN USER: UPSERT
     * ------------------------------------------------------- */
    let upsertedUser = null;
    if (login && typeof login === "object") {
      let existingUser = await models.User.findOne({
        where: { entity_type: "vendor", entity_id: vendor.id },
      });

      // Check duplicate email only when creating new account
      if (!existingUser && login.email) {
        const duplicateEmail = await models.User.findOne({
          where: { email: login.email },
        });
        if (duplicateEmail) {
          await t.rollback();
          return commonService.badRequest(res, "User Email already exists.");
        }
      }

      try {
        if (existingUser) {
          upsertedUser = await userSvc.updateUserByEntity(
            t,
            "vendor",
            vendor.id,
            login
          );
        } else {
          upsertedUser = await userSvc.createUserByEntity(
            t,
            "vendor",
            vendor.id,
            login
          );
        }
      } catch (e) {
        await t.rollback();
        return commonService.badRequest(res, "Failed to process user login.");
      }
    }

    /* -------------------------------------------------------
     * 4️⃣ SPOC DETAILS: UPSERT
     * ------------------------------------------------------- */
    let updatedSpocs = [];
    if (Array.isArray(spoc_details)) {
      const existingSpocs = await models.VendorSpocDetails.findAll({
        where: { vendor_id: vendor.id },
      });

      if (existingSpocs.length === 0) {
        updatedSpocs = await spocSvc.createVendorSpocsByVendor(
          t,
          vendor.id,
          spoc_details
        );
      } else {
        updatedSpocs = await spocSvc.updateVendorSpocsByVendor(
          t,
          vendor.id,
          spoc_details
        );
      }
    }

    /* -------------------------------------------------------
     * COMMIT TRANSACTION
     * ------------------------------------------------------- */
    await t.commit();

    return commonService.okResponse(res, {
      vendor,
      bank_account: upsertedBank,
      kyc_documents: updatedOrCreatedKyc,
      login: upsertedUser,
      spoc_details: updatedSpocs,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const deleteVendor = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const vendor = await models.Vendor.findByPk(id);
    if (!vendor) {
      await t.rollback();
      return commonService.notFound(res, message.vendor.notFound);
    }

    await models.BankAccount.destroy({
      where: { entity_type: "vendor", entity_id: id },
      transaction: t,
    });
    await models.KycDocument.destroy({
      where: { entity_type: "vendor", entity_id: id },
      transaction: t,
    });
    await models.User.destroy({
      where: { entity_type: "vendor", entity_id: id },
      transaction: t,
    });
    await models.VendorSpocDetails.destroy({
      where: { vendor_id: id },
      transaction: t,
    });

    await vendor.destroy({ transaction: t });
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const generateVendorCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Vendor,
      "vendor_code",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
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
  generateVendorCode,
};
