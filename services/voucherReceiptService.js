const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require("sequelize");

const generateReceiptNumber = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.VoucherReceipt,
      "receipt_no",
      String(prefix).toUpperCase(),
      { pad: 3 },
    );
    return commonService.okResponse(res, { receipt_number: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const createVoucherReceipt = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      receipt_no,
      receipt_date,
      bill_type_id,
      branch_id,
      payment_mode_id,
      account_id,
      transaction_no,
      reference_no,
      amount,
      amount_in_words,
      user_type_id,
      remarks,
    } = req.body;

    // Check if a non-deleted receipt no already uses this code
    if (receipt_no) {
      const existing = await models.VoucherReceipt.findOne({
        where: {
          receipt_no: receipt_no,
          deleted_at: null,
        },
      });

      if (existing) {
        return commonService.badRequest(res, {
          message: "Receipt number already exists",
        });
      }
    }

    const receipt = await models.VoucherReceipt.create(
      {
        receipt_no,
        receipt_date,
        branch_id,
        bill_type_id,
        payment_mode_id,
        account_id,
        transaction_no: transaction_no ?? null,
        reference_no: reference_no ?? null,
        amount,
        amount_in_words,
        user_type_id,
        remarks,
      },
      { transaction: t },
    );

    await t.commit();

    return commonService.createdResponse(res, {
      message: "Receipt created successfully",
      receipt,
    });

  } catch (err) {
    if (!t.finished) await t.rollback();
    return commonService.handleError(res, err);
  }
};

const getVoucherReceiptById = async (req, res) => {
  try {
    const sql = `
      SELECT
          vr.*,
          bt.bill_type,
          pm.payment_mode,
          CASE 
            WHEN vr.bill_type_id IN (2, 3) THEN l.ledger_name
            WHEN vr.user_type_id = 1 THEN v.vendor_name
            WHEN vr.user_type_id = 2 THEN c.customer_name
            ELSE NULL
          END AS account_name,
          CASE 
            WHEN vr.bill_type_id IN (2, 3) THEN l.ledger_no
            WHEN vr.user_type_id = 1 THEN v.mobile
            WHEN vr.user_type_id = 2 THEN c.mobile_number
            ELSE NULL
          END AS account_mobile,
          b.branch_name,
          b.address AS branch_address,
          b.gst_no AS branch_gst_no,
          b.mobile AS branch_mobile,
          b.pin_code,
          d.district_name,
          s.state_name
      FROM voucher_receipts vr
      LEFT JOIN bill_types bt ON bt.id = vr.bill_type_id AND bt.deleted_at IS NULL
      LEFT JOIN payment_modes pm ON pm.id = vr.payment_mode_id AND pm.deleted_at IS NULL
      LEFT JOIN ledger l ON l.id = vr.account_id AND vr.bill_type_id IN (2, 3) AND l.deleted_at IS NULL
      LEFT JOIN vendors v ON v.id = vr.account_id AND vr.user_type_id = 1 AND vr.bill_type_id NOT IN (2, 3) AND v.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = vr.account_id AND vr.user_type_id = 2 AND vr.bill_type_id NOT IN (2, 3) AND c.deleted_at IS NULL
      LEFT JOIN branches b ON b.id = vr.branch_id AND b.deleted_at IS NULL
      LEFT JOIN districts d ON d.id = b.district_id AND d.deleted_at IS NULL
      LEFT JOIN states s ON s.id = b.state_id AND s.deleted_at IS NULL
      WHERE vr.id = :receiptId AND vr.deleted_at IS NULL`;

    const [receipt] = await sequelize.query(sql, {
      replacements: { receiptId: req.params.id },
      type: sequelize.QueryTypes.SELECT,
    });

    if (!receipt) {
      return commonService.notFound(res, "Voucher receipt not found");
    }

    return commonService.okResponse(res, { data: receipt });
  } catch (error) {
    return commonService.handleError(
      res,
      error,
      "Error fetching voucher receipt",
    );
  }
};

const getVoucherReceipts = async (req, res) => {
  try {
    const {
      page,
      pageSize,
      search,
      receipt_date,
      branch_id,
    } = req.query;

    const replacements = {};
    let whereSql = "WHERE vr.deleted_at IS NULL";

    if (receipt_date) {
      whereSql += " AND vr.receipt_date = :receipt_date";
      replacements.receipt_date = receipt_date;
    }

    if (branch_id) {
      whereSql += " AND vr.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    if (search) {
      whereSql += `
        AND (
          vr.receipt_no ILIKE :search
          OR l.ledger_name ILIKE :search
          OR v.vendor_name ILIKE :search
          OR c.customer_name ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }

    // Pagination (ONLY if pageSize is provided)
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
        vr.id,
        vr.branch_id,
        vr.receipt_no,
        vr.receipt_date,
        vr.amount,
        vr.account_id,
        vr.user_type_id,
        vr.bill_type_id,
        CASE 
          WHEN vr.bill_type_id IN (2, 3) THEN l.ledger_name
          WHEN vr.user_type_id = 1 THEN v.vendor_name
          WHEN vr.user_type_id = 2 THEN c.customer_name
          ELSE NULL
        END AS account_name,
        CASE 
          WHEN vr.bill_type_id IN (2, 3) THEN l.ledger_no
          WHEN vr.user_type_id = 1 THEN v.mobile
          WHEN vr.user_type_id = 2 THEN c.mobile_number
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
      FROM voucher_receipts vr
      LEFT JOIN ledger l ON l.id = vr.account_id AND vr.bill_type_id IN (2, 3) AND l.deleted_at IS NULL
      LEFT JOIN vendors v ON v.id = vr.account_id AND vr.user_type_id = 1 AND vr.bill_type_id NOT IN (2, 3) AND v.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = vr.account_id AND vr.user_type_id = 2 AND vr.bill_type_id NOT IN (2, 3) AND c.deleted_at IS NULL
      LEFT JOIN branches b ON b.id = vr.branch_id AND b.deleted_at IS NULL
      LEFT JOIN districts d ON d.id = b.district_id AND d.deleted_at IS NULL
      LEFT JOIN states s ON s.id = b.state_id AND s.deleted_at IS NULL
      ${whereSql}
      ORDER BY vr.receipt_no DESC
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
        FROM voucher_receipts vr
        LEFT JOIN ledger l ON l.id = vr.account_id AND vr.bill_type_id IN (2, 3) AND l.deleted_at IS NULL
        LEFT JOIN vendors v ON v.id = vr.account_id AND vr.user_type_id = 1 AND vr.bill_type_id NOT IN (2, 3) AND v.deleted_at IS NULL
        LEFT JOIN customers c ON c.id = vr.account_id AND vr.user_type_id = 2 AND vr.bill_type_id NOT IN (2, 3) AND c.deleted_at IS NULL
        LEFT JOIN branches b ON b.id = vr.branch_id AND b.deleted_at IS NULL
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
    return commonService.handleError(res, error, "Error fetching receipts");
  }
};


const deleteVoucherReceipt = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const receipt = await models.VoucherReceipt.findByPk(req.params.id);
    if (!receipt) {
      return commonService.notFound(res, "Voucher receipt not found");
    }

    await receipt.destroy({ transaction: t });
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (error) {
    await t.rollback();
    return commonService.handleError(
      res,
      error,
      "Error deleting voucher receipt",
    );
  }
};

const updateVoucherReceipt = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;

    const entity = await models.VoucherReceipt.findOne({
      where: {
        id,
        deleted_at: null,
      },
      transaction: t,
    });

    if (!entity) {
      await t.rollback();
      return commonService.notFound(res, "Receipt not found");
    }

    const {
      receipt_no,
      receipt_date,
      bill_type_id,
      branch_id,
      payment_mode_id,
      account_id,
      transaction_no,
      reference_no,
      amount,
      amount_in_words,
      user_type_id,
      remarks,
    } = req.body;

    // Validate receipt_no uniqueness (exclude current record)
    if (receipt_no && receipt_no !== entity.receipt_no) {
      const existing = await models.VoucherReceipt.findOne({
        where: {
          receipt_no,
          deleted_at: null,
          id: { [Op.ne]: entity.id },
        },
        transaction: t,
      });

      if (existing) {
        await t.rollback();
        return commonService.badRequest(res, {
          message: "Receipt number already exists",
        });
      }
    }

    const updatePayload = {
      receipt_no: receipt_no ?? entity.receipt_no,
      receipt_date: receipt_date ?? entity.receipt_date,
      branch_id: branch_id ?? entity.branch_id,
      bill_type_id: bill_type_id ?? entity.bill_type_id,
      payment_mode_id: payment_mode_id ?? entity.payment_mode_id,
      account_id: account_id ?? entity.account_id,
      transaction_no: transaction_no ?? entity.transaction_no,
      reference_no: reference_no ?? entity.reference_no,
      amount: amount ?? entity.amount,
      amount_in_words: amount_in_words ?? entity.amount_in_words,
      user_type_id: user_type_id ?? entity.user_type_id,
      remarks: remarks ?? entity.remarks,
    };

    await entity.update(updatePayload, { transaction: t });

    await t.commit();

    return commonService.okResponse(res, {
      message: "Receipt updated successfully",
      receipt: entity,
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return commonService.handleError(res, err);
  }
};


module.exports = {
  generateReceiptNumber,
  createVoucherReceipt,
  getVoucherReceiptById,
  deleteVoucherReceipt,
  getVoucherReceipts,
  updateVoucherReceipt
};
