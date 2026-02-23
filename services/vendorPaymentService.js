const { models, sequelize } = require("../models");
const commonService = require('./commonService');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require('sequelize');

const createVendorPayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { payment_no, payment_date, bill_type_id, branch_id, payment_mode, account_name_id, amount, amount_in_words, invoice_id, purchase_id, ref_id, remarks, transaction_no, user_type_id } = req.body;

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
      branch_id,
      bill_type_id,
      payment_mode,
      account_name_id,
      amount,
      amount_in_words,
      invoice_id,
      purchase_id,
      ref_id,
      remarks,
      transaction_no,
      user_type_id,
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
      branch_id,
      payment_date
    } = req.query;

    const replacements = {};
    let whereSql = "WHERE vp.deleted_at IS NULL and vp.is_active = true"; // Only fetch active (non-deleted) records

    // Filters
    if (bill_type_id) {
      whereSql += " AND vp.bill_type_id = :bill_type_id";
      replacements.bill_type_id = bill_type_id;
    }

    if (branch_id) {
      whereSql += " AND vp.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    if (payment_mode) {
      whereSql += " AND vp.payment_mode = :payment_mode";
      replacements.payment_mode = payment_mode;
    }

    if (payment_date) {
      whereSql += " AND vp.payment_date = :payment_date";
      replacements.payment_date = payment_date;
    }

    // Search across payment_no, ledger_name, vendor_name, customer_name
    if (search) {
      whereSql += `
        AND (
          vp.payment_no ILIKE :search
          OR l.ledger_name ILIKE :search
          OR v.vendor_name ILIKE :search
          OR c.customer_name ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }

    // Pagination
    let paginationSql = "";
    let offset = 0;

    if (pageSize) {
      const limit = parseInt(pageSize);
      offset = ((parseInt(page || 1) - 1) * limit);
      paginationSql = " LIMIT :limit OFFSET :offset";
      replacements.limit = limit;
      replacements.offset = offset;
    }

    const dataQuery = `
      SELECT
        vp.id,
        vp.payment_no,
        vp.payment_date,
        vp.bill_type_id,
        vp.branch_id,
        vp.payment_mode,
        vp.account_name_id,
        vp.user_type_id,
        vp.amount,
        vp.transaction_no,
        vp.status,
        vp.invoice_id,
        vp.purchase_id,

        -- ✅ GRN / Invoice number
      CASE
        WHEN vp.purchase_id IS NOT NULL THEN g.grn_no
        WHEN vp.invoice_id IS NOT NULL THEN si.invoice_no
        ELSE NULL
      END AS reference_no,

        CASE
        WHEN vp.purchase_id IS NOT NULL THEN 'GRN'
        WHEN vp.invoice_id IS NOT NULL THEN 'INVOICE'
        ELSE NULL
      END AS reference_type,

        CASE 
        WHEN vp.bill_type_id IN(2, 3) THEN l.ledger_name
        WHEN vp.user_type_id = 1 THEN v.vendor_name
        WHEN vp.user_type_id = 2 THEN c.customer_name
        ELSE NULL
      END AS account_name,

        CASE 
        WHEN vp.bill_type_id IN(2, 3) THEN l.ledger_no
        WHEN vp.user_type_id = 1 THEN v.mobile
        WHEN vp.user_type_id = 2 THEN c.mobile_number
        ELSE NULL
      END AS account_mobile,

        b.branch_name,
        b.address AS branch_address,
        b.gst_no AS branch_gst_no,
        b.mobile AS branch_mobile,
        b.signature_url AS branch_signature_url,
        b.pin_code AS branch_pin_code,
        d.district_name,
        s.state_name
      FROM vendor_payments vp
      LEFT JOIN ledger l ON l.id = vp.account_name_id AND vp.bill_type_id IN(2, 3) AND l.deleted_at IS NULL
      LEFT JOIN vendors v ON v.id = vp.account_name_id AND vp.user_type_id = 1 AND vp.bill_type_id NOT IN (2, 3) AND v.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = vp.account_name_id AND vp.user_type_id = 2 AND vp.bill_type_id NOT IN(2, 3) AND c.deleted_at IS NULL

      -- ✅ NEW JOINS
      LEFT JOIN grns g ON vp.purchase_id IS NOT NULL AND g.id = vp.purchase_id:: int AND g.deleted_at IS NULL
      LEFT JOIN sales_invoice_bills si ON vp.invoice_id IS NOT NULL AND si.id = vp.invoice_id:: int AND si.deleted_at IS NULL
      LEFT JOIN branches b ON b.id = vp.branch_id AND b.deleted_at IS NULL
      LEFT JOIN districts d ON d.id = b.district_id AND d.deleted_at IS NULL
      LEFT JOIN states s ON s.id = b.state_id AND s.deleted_at IS NULL
      ${whereSql}
      ORDER BY vp.created_at DESC
      ${paginationSql}
    `;

    const data = await sequelize.query(dataQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Count query (for pagination only)
    let total = data.length;

    if (pageSize) {
      const countQuery = `
        SELECT COUNT(*)::int AS count
        FROM vendor_payments vp
        LEFT JOIN ledger l ON l.id = vp.account_name_id AND vp.bill_type_id IN (2, 3) AND l.deleted_at IS NULL
        LEFT JOIN vendors v ON v.id = vp.account_name_id AND vp.user_type_id = 1 AND vp.bill_type_id NOT IN (2, 3) AND v.deleted_at IS NULL
        LEFT JOIN customers c ON c.id = vp.account_name_id AND vp.user_type_id = 2 AND vp.bill_type_id NOT IN (2, 3) AND c.deleted_at IS NULL
        LEFT JOIN branches b ON b.id = vp.branch_id AND b.deleted_at IS NULL
        ${whereSql}
      `;

      const countResult = await sequelize.query(countQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      });

      total = countResult[0]?.count || 0;
    }

    return commonService.okResponse(res, {
      data,
      ...(pageSize && {
        pagination: {
          total,
          page: Number(page || 1),
          pageSize: Number(pageSize),
          totalPages: Math.ceil(total / pageSize),
        },
      }),
    });

  } catch (error) {
    return commonService.handleError(res, error, 'Error fetching vendor payments');
  }
};

const getVendorPaymentById = async (req, res) => {
  try {
    const sql = `
      SELECT
          vp.*,
          bt.bill_type,
          pm.payment_mode,
          CASE 
            WHEN vp.bill_type_id IN (2, 3) THEN l.ledger_name
            WHEN vp.user_type_id = 1 THEN v.vendor_name
            WHEN vp.user_type_id = 2 THEN c.customer_name
            ELSE NULL
          END AS account_name,
          CASE 
            WHEN vp.bill_type_id IN (2, 3) THEN l.ledger_no
            WHEN vp.user_type_id = 1 THEN v.mobile
            WHEN vp.user_type_id = 2 THEN c.mobile_number
            ELSE NULL
          END AS account_mobile,
          b.branch_name,
          b.address AS branch_address,
          b.gst_no AS branch_gst_no,
          b.mobile AS branch_mobile,
          b.signature_url AS branch_signature_url,
          b.pin_code,
          d.district_name,
          s.state_name
      FROM vendor_payments vp
      LEFT JOIN bill_types bt ON bt.id = vp.bill_type_id AND bt.deleted_at IS NULL
      LEFT JOIN payment_modes pm ON pm.id = vp.payment_mode AND pm.deleted_at IS NULL
      LEFT JOIN ledger l ON l.id = vp.account_name_id AND vp.bill_type_id IN (2, 3) AND l.deleted_at IS NULL
      LEFT JOIN vendors v ON v.id = vp.account_name_id AND vp.user_type_id = 1 AND vp.bill_type_id NOT IN (2, 3) AND v.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = vp.account_name_id AND vp.user_type_id = 2 AND vp.bill_type_id NOT IN (2, 3) AND c.deleted_at IS NULL
      LEFT JOIN branches b ON b.id = vp.branch_id AND b.deleted_at IS NULL
      LEFT JOIN districts d ON d.id = b.district_id AND d.deleted_at IS NULL
      LEFT JOIN states s ON s.id = b.state_id AND s.deleted_at IS NULL
      WHERE vp.id = :paymentId AND vp.deleted_at IS NULL`;

    const [payment] = await sequelize.query(sql, {
      replacements: { paymentId: req.params.id },
      type: sequelize.QueryTypes.SELECT,
    });

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


const getBillTypeDropdown = async (_req, res) => {
  try {
    const rows = await models.BillType.findAll({
      order: [["id", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, name: r.bill_type }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getPaymentModeDropdown = async (_req, res) => {
  try {
    const rows = await models.PaymentMode.findAll({
      order: [["id", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, name: r.payment_mode }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getInvoiceDropdown = async (req, res) => {
  try {
    const rows = await models.SalesInvoiceBill.findAll({
      order: [["id", "ASC"]],
    });
    const items = rows.map((r) => ({ id: r.id, number: r.invoice_no }));
    return commonService.okResponse(res, { items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const activateDeactivateVendorPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return commonService.badRequest(res, "is_active must be true or false");
    }

    const payment = await models.VendorPayment.findByPk(id, {
      paranoid: false,
    });

    if (!payment) {
      return commonService.notFound(res, "Vendor payment not found");
    }

    if (payment.is_active === is_active) {
      return commonService.badRequest(
        res,
        `Vendor payment already ${is_active ? "active" : "inactive"}`
      );
    }

    await payment.update({
      is_active,
      status: is_active ? "Completed" : "Cancelled",
    });

    return commonService.okResponse(res, {
      message: `Vendor payment ${is_active ? "activated" : "deactivated"} successfully`,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createVendorPayment,
  getVendorPayments,
  getVendorPaymentById,
  updateVendorPayment,
  deleteVendorPayment,
  generatePaymentNumber,
  getBillTypeDropdown,
  getPaymentModeDropdown,
  getInvoiceDropdown,
  activateDeactivateVendorPayment
};