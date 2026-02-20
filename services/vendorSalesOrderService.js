const { models, sequelize } = require("../models");
const commonService = require('./commonService');
const { Op } = require('sequelize');

const submitVendorSalesOrder = async (req, res) => {
const transaction = await sequelize.transaction();

try {
    const { id } = req.params;
    const {
        sales_order_date,
        consignment_date,
        credit_terms,
        additional_charges = [],
        remarks,
    } = req.body;

    // 🔒 Required ONLY on accept
    if (!sales_order_date || !consignment_date || !credit_terms) {
        await transaction.rollback();
        return commonService.badRequest(
            res,
            "Sales order date, consignment date and credit terms are required"
        );
    }

    const salesOrder = await models.SalesOrder.findByPk(id, { transaction });
    if (!salesOrder) {
        await transaction.rollback();
        return commonService.notFound(res, "Sales order not found");
    }

    if (salesOrder.status !== "pending") {
        await transaction.rollback();
        return commonService.badRequest(
            res,
            "Sales order already processed"
        );
    }

    // Replace additional charges
    await models.SalesOrderAdditionalCharge.destroy({
        where: { sales_order_id: id },
        transaction,
    });

    let chargesTotal = 0;

    if (additional_charges.length) {
        additional_charges.forEach(c => {
            chargesTotal += Number(c.amount || 0);
        });

        await models.SalesOrderAdditionalCharge.bulkCreate(
            additional_charges.map(c => ({
                sales_order_id: id,
                charge_name: c.charge_name,
                amount: c.amount,
            })),
            { transaction }
        );
    }

    await salesOrder.update(
        {
            status: "accepted",
            response_date: new Date(),
            remarks,

            // ✅ vendor-provided fields
            sales_order_date,
            consignment_date,
            credit_terms,

            // ✅ only total changes due to charges
            total_amount: Number(salesOrder.total_amount) + chargesTotal,
        },
        { transaction }
    );

    await transaction.commit();
    return commonService.okResponse(res, salesOrder);
} catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
}
};

const updateVendorSalesOrderStatus = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params; // sales_order_id
        const { status, remarks } = req.body;

        if (!["accepted", "rejected"].includes(status)) {
            await t.rollback();
            return commonService.badRequest(
                res,
                "Status must be accepted or rejected"
            );
        }

        const salesOrder = await models.SalesOrder.findByPk(id, { transaction: t });
        if (!salesOrder) {
            await t.rollback();
            return commonService.notFound(res, "Sales order not found");
        }

        if (salesOrder.status !== "pending") {
            await t.rollback();
            return commonService.badRequest(
                res,
                "Sales order already responded"
            );
        }

        await salesOrder.update(
            {
                status,
                response_date: new Date(),
                remarks,
            },
            { transaction: t }
        );

        await t.commit();
        return commonService.okResponse(res, salesOrder);
    } catch (err) {
        await t.rollback();
        return commonService.handleError(res, err);
    }
};

const listVendorSalesOrders = async (req, res) => {
    try {
        const {
            page,
            limit,
            status = "pending", // ✅ default = Received
            vendor_id,
            date,
            search,
        } = req.query;

        if (!vendor_id) {
            return commonService.badRequest(res, "vendor_id is required");
        }

        const replacements = {
            vendor_id: Number(vendor_id),
        };

        // ---------------- BASE FILTER ----------------
        let whereSql = `
      WHERE so.vendor_id = :vendor_id
        AND so.deleted_at IS NULL
    `;

        if (status) {
            whereSql += ` AND so.status = :status`;
            replacements.status = status;
        }

        if (date) {
            whereSql += ` AND po.po_date = :date`;
            replacements.date = date;
        }

        if (search) {
            whereSql += ` AND po.po_no ILIKE :search`;
            replacements.search = `%${search}%`;
        }

        // ---------------- SCORE CARD (FILTER-AWARE) ----------------
        const scoreCardQuery = `
      SELECT
        COUNT(CASE WHEN so.status = 'pending' THEN 1 END)  AS received,
        COUNT(CASE WHEN so.status = 'accepted' THEN 1 END) AS sent,
        COUNT(CASE WHEN so.status = 'rejected' THEN 1 END) AS rejected
      FROM sales_orders so
      LEFT JOIN purchase_orders po ON po.id = so.po_id
      WHERE so.vendor_id = :vendor_id
        AND so.deleted_at IS NULL
        ${date ? "AND po.po_date = :date" : ""}
        ${search ? "AND po.po_no ILIKE :search" : ""}
    `;

        const [scoreCardResult] = await sequelize.query(scoreCardQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT,
        });

        // ---------------- PAGINATION ----------------
        let paginationSql = "";
        let pageNum, limitNum;

        if (page || limit) {
            pageNum = Number(page) || 1;
            limitNum = Number(limit) || 10;
            const offset = (pageNum - 1) * limitNum;

            paginationSql = ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        // ---------------- TOTAL COUNT ----------------
        const countQuery = `
      SELECT COUNT(DISTINCT so.id) AS total
      FROM sales_orders so
      LEFT JOIN purchase_orders po ON po.id = so.po_id
      ${whereSql}
    `;

        const [countResult] = await sequelize.query(countQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT,
        });

        const total = Number(countResult.total || 0);

        // ---------------- LIST DATA ----------------
        const listQuery = `
      SELECT
        so.id,
        so.sales_order_date,
        so.consignment_date,
        so.credit_terms,
        so.vendor_id,
        so.status,
        so.total_amount,
        so.created_at,

        v.state_id AS vendor_state_id,

        po.id     AS po_id,
        po.po_no,
        po.po_date,

        STRING_AGG(DISTINCT c.category_name, ', ') AS item_details,
        COALESCE(SUM(poi.quantity), 0) AS quantity

      FROM sales_orders so
      LEFT JOIN purchase_orders po ON po.id = so.po_id
      LEFT JOIN purchase_order_items poi
        ON poi.po_id = po.id AND poi.deleted_at IS NULL
      LEFT JOIN categories c ON c.id = poi.category_id
      LEFT JOIN vendors v ON v.id = so.vendor_id

      ${whereSql}

      GROUP BY so.id, po.id, state_id
      ORDER BY so.created_at DESC
      ${paginationSql}
    `;

        const rows = await sequelize.query(listQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT,
        });

        return commonService.okResponse(res, {
            score_card: {
                received: Number(scoreCardResult.received || 0),
                sent: Number(scoreCardResult.sent || 0),
                rejected: Number(scoreCardResult.rejected || 0),
            },
            total,
            ...(page || limit
                ? {
                    page: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                }
                : {}),
            data: rows,
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

const rejectVendorSalesOrder = async (req, res) => {
    const { id } = req.params;
    const { remarks } = req.body;

    const salesOrder = await models.SalesOrder.findByPk(id);
    if (!salesOrder) {
        return commonService.notFound(res, "Sales order not found");
    }

    if (salesOrder.status !== "pending") {
        return commonService.badRequest(res, "Order already processed");
    }

    await salesOrder.update({
        status: "rejected",
        response_date: new Date(),
        remarks,
    });

    return commonService.okResponse(res, salesOrder);
};

const getVendorSalesOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        // 1️⃣ Get Sales Order
        const salesOrder = await models.SalesOrder.findByPk(id, {
            raw: true,
        });

        if (!salesOrder) {
            return commonService.notFound(res, "Sales order not found");
        }

        // 2️⃣ Get Purchase Order
        const po = await models.PurchaseOrder.findByPk(salesOrder.po_id, {
            raw: true,
        });

        const vendor = await models.Vendor.findByPk(salesOrder.vendor_id, {
            attributes: ['id', 'state_id'],
            raw: true,
        });

        // 3️⃣ Get PO Items (with master names)
        const items = await sequelize.query(
            `
      SELECT 
        poi.*,
        mt.material_type   AS material_type_name,
        c.category_name    AS category_name,
        sc.subcategory_name AS subcategory_name
      FROM purchase_order_items poi
      LEFT JOIN "materialTypes" mt ON mt.id = poi.material_type_id
      LEFT JOIN categories c ON c.id = poi.category_id
      LEFT JOIN subcategories sc ON sc.id = poi.subcategory_id
      WHERE poi.po_id = :poId
        AND poi.deleted_at IS NULL
      ORDER BY poi.id ASC
      `,
            {
                replacements: { poId: salesOrder.po_id },
                type: sequelize.QueryTypes.SELECT,
            }
        );

        // 4️⃣ Get Additional Charges
        const additionalCharges = await models.SalesOrderAdditionalCharge.findAll({
            where: { sales_order_id: id },
            raw: true,
        });

        // 5️⃣ Assemble response for UI
        return commonService.okResponse(res, {
            sales_order: {
                id: salesOrder.id,
                status: salesOrder.status,
                remarks: salesOrder.remarks,
                response_date: salesOrder.response_date,
                vendor_id: salesOrder.vendor_id,
                vendor_state_id: vendor?.state_id || null,
                sales_order_date: salesOrder.sales_order_date,
                consignment_date: salesOrder.consignment_date,
                credit_terms: salesOrder.credit_terms,

                sub_total: salesOrder.sub_total,
                sgst_percentage: salesOrder.sgst_percentage,
                sgst_amount: salesOrder.sgst_amount,
                cgst_percentage: salesOrder.cgst_percentage,
                cgst_amount: salesOrder.cgst_amount,
                round_off: salesOrder.round_off,
                total_amount: salesOrder.total_amount,
            },

            purchase_order: {
                id: po.id,
                po_no: po.po_no,
                po_date: po.po_date,
            },

            items,
            additional_charges: additionalCharges,
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};





module.exports = {
    submitVendorSalesOrder,
    updateVendorSalesOrderStatus,
    rejectVendorSalesOrder,
    listVendorSalesOrders,
    getVendorSalesOrderById
};


