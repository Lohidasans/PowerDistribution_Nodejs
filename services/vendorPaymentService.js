const { models, sequelize } = require("../models");
const commonService = require('./commonService');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require('sequelize');

const createVendorPayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { payment_no, payment_date, bill_type_id, payment_mode, account_name_id, amount, amount_in_words, invoice_id, purchase_id, ref_id, remarks } = req.body;

    // Check if a non-deleted payment no already uses this code
    if (payment_no) {
      const existing = await models.VendorPayment.findOne({
        where: {
          payment_no: payment_no,
          deleted_at: null,     // only check active (non-deleted) records
        },
      });

      if (existing) {
        return commonService.badRequest(res, {
          message: "Vendor Payment number already exists",
        });
      }
    }

    const payment = await models.VendorPayment.create({
      payment_no,
      payment_date,
      bill_type_id,
      payment_mode,
      account_name_id,
      amount,
      amount_in_words,
      invoice_id,
      purchase_id,
      ref_id,
      remarks,
      status: 'Completed'
    }, { transaction: t });

    await t.commit();
    return commonService.createdResponse(res, { data: payment });
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, 'Error creating vendor payment');
  }
};

const getVendorPayments = async (req, res) => {
  try {
    const {
      page,
      pageSize,
      bill_type_id,
      payment_mode,
      search,
      payment_date
    } = req.query;

    const whereClause = {};

    // Filters
    if (bill_type_id) whereClause.bill_type_id = bill_type_id;
    if (payment_mode) whereClause.payment_mode = payment_mode;
    if (payment_date) {
      whereClause.payment_date = { [Op.eq]: payment_date };
    }
    // Search (payment_no + vendor_name)
    if (search) {
      const vendors = await models.Vendor.findAll({
        where: {
          vendor_name: { [Op.like]: `%${search}%` }
        },
        attributes: ['id']
      });

      const vendorIds = vendors.map(v => v.id);

      whereClause[Op.or] = [
        { payment_no: { [Op.like]: `%${search}%` } },
        ...(vendorIds.length
          ? [{ account_name_id: { [Op.in]: vendorIds } }]
          : [])
      ];
    }

    // Pagination (page/pageSize based)
    const shouldPaginate = page || pageSize;

    const limit = shouldPaginate ? parseInt(pageSize || 10) : undefined;
    const offset = shouldPaginate
      ? ((parseInt(page || 1) - 1) * limit)
      : undefined;

    const queryOptions = {
      where: whereClause,
      order: [['created_at', 'DESC']],
      ...(shouldPaginate && { limit, offset })
    };

    // Fetch Payments

    const result = shouldPaginate
      ? await models.VendorPayment.findAndCountAll(queryOptions)
      : {
        count: await models.VendorPayment.count({ where: whereClause }),
        rows: await models.VendorPayment.findAll(queryOptions)
      };

    // Fetch Vendors

    const vendorIds = [...new Set(
      result.rows.map(p => p.account_name_id).filter(Boolean)
    )];

    const vendors = vendorIds.length
      ? await models.Vendor.findAll({
        where: { id: vendorIds },
        attributes: ['id', 'vendor_name']
      })
      : [];

    const vendorMap = {};
    vendors.forEach(v => {
      vendorMap[v.id] = v.vendor_name;
    });

    // Attach vendor_name

    const formattedRows = result.rows.map(p => ({
      ...p.toJSON(),
      vendor_name: vendorMap[p.account_name_id] || null
    }));

    // Response

    return commonService.okResponse(res, {
      data: formattedRows,
      ...(shouldPaginate && {
        pagination: {
          total: result.count,
          page: parseInt(page || 1),
          pageSize: limit,
          totalPages: Math.ceil(result.count / limit)
        }
      })
    });

  } catch (error) {
    return commonService.handleError(res, error, 'Error fetching vendor payments');
  }
};

const getVendorPaymentById = async (req, res) => {
  try {
    const payment = await models.VendorPayment.findByPk(req.params.id);
    if (!payment) {
      return commonService.notFound(res, 'Vendor payment not found');
    }
    return commonService.okResponse(res, { data: payment });
  } catch (error) {
    return commonService.handleError(res, error, 'Error fetching vendor payment');
  }
};

const updateVendorPayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const payment = await models.VendorPayment.findByPk(req.params.id);
    if (!payment) {
      return commonService.notFound(res, 'Vendor payment not found');
    }

    const updatedPayment = await payment.update(req.body, { transaction: t });
    await t.commit();
    return commonService.okResponse(res, 'Vendor payment updated successfully', updatedPayment);
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, 'Error updating vendor payment');
  }
};

const deleteVendorPayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const payment = await models.VendorPayment.findByPk(req.params.id);
    if (!payment) {
      return commonService.notFound(res, 'Vendor payment not found');
    }

    await payment.destroy({ transaction: t });
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, 'Error deleting vendor payment');
  }
};

const generatePaymentNumber = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.VendorPayment,
      "payment_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { payment_number: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
}

module.exports = {
  createVendorPayment,
  getVendorPayments,
  getVendorPaymentById,
  updateVendorPayment,
  deleteVendorPayment,
  generatePaymentNumber
};