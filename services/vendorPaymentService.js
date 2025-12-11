const { models, sequelize } = require("../models");
const commonService = require('./commonService');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require('sequelize');

const createVendorPayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { payment_no, payment_date, bill_type, payment_mode, account_name_id, amount, amount_in_words, invoice_id, purchase_id, ref_id, remarks } = req.body;

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
      bill_type,
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
    return commonService.createdResponse(res, 'Vendor payment created successfully', payment);
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, 'Error creating vendor payment');
  }
};

const getVendorPayments = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, bill_type, payment_mode, start_date, end_date, search } = req.query;
    const offset = (page - 1) * pageSize;

    const whereClause = {};
    if (bill_type) whereClause.bill_type = bill_type;
    if (payment_mode) whereClause.payment_mode = payment_mode;
    if (search) {
      whereClause[Op.or] = [
        { payment_no: { [Op.like]: `%${search}%` } },
        { account_name_id: { [Op.like]: `%${search}%` } }
      ];
    }
    if (start_date || end_date) {
      whereClause.payment_date = {};
      if (start_date) whereClause.payment_date[Op.gte] = new Date(start_date);
      if (end_date) whereClause.payment_date[Op.lte] = new Date(end_date);
    }

    const { count, rows } = await models.VendorPayment.findAndCountAll({
      where: whereClause,
      limit: parseInt(pageSize),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    return commonService.okResponse(res, {
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(count / pageSize)
      }
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