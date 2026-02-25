const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");

/**
 * Get total vendor count (excluding soft-deleted)
 */
const getTotalVendorCount = async (req, res) => {
    try {
        const count = await models.Vendor.count({
            where: { deleted_at: null },
        });

        return commonService.okResponse(res, { total_vendors: count });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get active vendor count
 */
const getActiveVendorCount = async (req, res) => {
    try {
        const count = await models.Vendor.count({
            where: {
                status: "Active",
                deleted_at: null,
            },
        });

        return commonService.okResponse(res, { active_vendors: count });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get outstanding payables (Total GRN amount - Total payments)
 */
const getOutstandingPayables = async (req, res) => {
    try {
        // Get total GRN amount
        const totalGrnQuery = `
      SELECT COALESCE(SUM(total_amount), 0) as total_grn_amount
      FROM grns
      WHERE deleted_at IS NULL
    `;

        // Get total vendor payments
        const totalPaymentsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_payments
      FROM vendor_payments
      WHERE deleted_at IS NULL
        AND status = 'Completed'
    `;

        const [[grnResult], [paymentResult]] = await Promise.all([
            sequelize.query(totalGrnQuery, { type: sequelize.QueryTypes.SELECT }),
            sequelize.query(totalPaymentsQuery, { type: sequelize.QueryTypes.SELECT }),
        ]);

        const totalGrnAmount = parseFloat(grnResult.total_grn_amount) || 0;
        const totalPayments = parseFloat(paymentResult.total_payments) || 0;
        const outstandingPayables = totalGrnAmount - totalPayments;

        return commonService.okResponse(res, {
            outstanding_payables: outstandingPayables.toFixed(2),
            total_grn_amount: totalGrnAmount.toFixed(2),
            total_payments: totalPayments.toFixed(2),
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get vendor sales contribution (purchase value per vendor with material breakdown)
 */
const getVendorSalesContribution = async (req, res) => {
    try {
        const query = `
      SELECT 
        v.id,
        v.vendor_name,
        v.vendor_code,
        v.vendor_image_url,
        COALESCE(SUM(CASE WHEN mt.material_type = 'Gold' THEN gi.gross_wt_in_g ELSE 0 END), 0) as gold_weight,
        COALESCE(SUM(CASE WHEN mt.material_type = 'Silver' THEN gi.gross_wt_in_g ELSE 0 END), 0) as silver_weight,
        COALESCE(SUM(g.total_amount), 0) as total_value
      FROM vendors v
      LEFT JOIN grns g ON g.vendor_id = v.id AND g.deleted_at IS NULL
      LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
      LEFT JOIN "materialTypes" mt ON mt.id = gi.material_type_id AND mt.deleted_at IS NULL
      WHERE v.deleted_at IS NULL
      GROUP BY v.id, v.vendor_name, v.vendor_code, v.vendor_image_url
      HAVING COALESCE(SUM(g.total_amount), 0) > 0
      ORDER BY total_value DESC
    `;

        const [vendors] = await sequelize.query(query);

        // Format the response
        const formattedVendors = vendors.map((vendor) => ({
            id: vendor.id,
            vendor_name: vendor.vendor_name,
            vendor_code: vendor.vendor_code,
            vendor_image_url: vendor.vendor_image_url,
            gold: parseFloat(vendor.gold_weight).toFixed(2) + " g",
            silver: parseFloat(vendor.silver_weight).toFixed(2) + " g",
            total_value: parseFloat(vendor.total_value).toFixed(2),
        }));

        return commonService.okResponse(res, { vendors: formattedVendors });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get purchase by material type (weight-based distribution for pie chart)
 */
const getPurchaseByMaterialType = async (req, res) => {
    try {
        const query = `
      SELECT 
        mt.id,
        mt.material_type,
        COALESCE(SUM(gi.gross_wt_in_g), 0) as total_weight,
        COUNT(gi.id) as item_count
      FROM "materialTypes" mt
      LEFT JOIN "grnItems" gi ON gi.material_type_id = mt.id AND gi.deleted_at IS NULL
      WHERE mt.deleted_at IS NULL
      GROUP BY mt.id, mt.material_type
      HAVING COALESCE(SUM(gi.gross_wt_in_g), 0) > 0
      ORDER BY total_weight DESC
    `;

        const [materials] = await sequelize.query(query);

        // Calculate total weight for percentage calculation
        const totalWeight = materials.reduce(
            (sum, material) => sum + parseFloat(material.total_weight),
            0
        );

        // Format the response with percentages
        const formattedMaterials = materials.map((material) => {
            const weight = parseFloat(material.total_weight);
            const percentage = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;

            return {
                id: material.id,
                material_type: material.material_type,
                total_weight: weight.toFixed(2),
                item_count: parseInt(material.item_count),
                percentage: percentage.toFixed(2),
            };
        });

        return commonService.okResponse(res, {
            materials: formattedMaterials,
            total_weight: totalWeight.toFixed(2),
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get top buying categories (purchase volume by category)
 */
const getTopBuyingCategories = async (req, res) => {
    try {
        const query = `
      SELECT 
        c.id,
        c.category_name,
        COUNT(gi.id) as item_count,
        COALESCE(SUM(gi.gross_wt_in_g), 0) as total_weight,
        COALESCE(SUM(gi.total_amount), 0) as total_value
      FROM categories c
      LEFT JOIN "grnItems" gi ON gi.category_id = c.id AND gi.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.category_name
      HAVING COUNT(gi.id) > 0
      ORDER BY item_count DESC
      LIMIT 10
    `;

        const [categories] = await sequelize.query(query);

        // Format the response
        const formattedCategories = categories.map((category) => ({
            id: category.id,
            category_name: category.category_name,
            item_count: parseInt(category.item_count),
            total_weight: parseFloat(category.total_weight).toFixed(2),
            total_value: parseFloat(category.total_value).toFixed(2),
        }));

        return commonService.okResponse(res, { categories: formattedCategories });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get transaction history (GRN transactions with payment details)
 */
const getTransactionHistory = async (req, res) => {
    try {
        const { page = 1, limit = 10, vendor_id, start_date, end_date } = req.query;
        const offset = (page - 1) * limit;

        // Build filters
        let whereConditions = "WHERE g.deleted_at IS NULL";
        const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

        if (vendor_id) {
            whereConditions += " AND g.vendor_id = :vendor_id";
            replacements.vendor_id = parseInt(vendor_id);
        }

        if (start_date && end_date) {
            whereConditions += " AND g.grn_date BETWEEN CAST(:start_date AS DATE) AND CAST(:end_date AS DATE)";
            replacements.start_date = start_date;
            replacements.end_date = end_date;
        } else if (start_date) {
            whereConditions += " AND g.grn_date >= CAST(:start_date AS DATE)";
            replacements.start_date = start_date;
        } else if (end_date) {
            whereConditions += " AND g.grn_date <= CAST(:end_date AS DATE)";
            replacements.end_date = end_date;
        }

        // Get transaction history with payment details
        const query = `
      SELECT 
        g.id,
        g.grn_no,
        g.grn_date,
        g.vendor_id,
        v.vendor_name,
        v.vendor_code,
        g.total_amount as total_purchase,
        COALESCE(
          (
            SELECT SUM(vp.amount)
            FROM vendor_payments vp
            WHERE vp.deleted_at IS NULL
              AND vp.status = 'Completed'
              AND vp.ref_id = g.grn_no
          ), 0
        ) as total_paid,
        (g.total_amount - COALESCE(
          (
            SELECT SUM(vp.amount)
            FROM vendor_payments vp
            WHERE vp.deleted_at IS NULL
              AND vp.status = 'Completed'
              AND vp.ref_id = g.grn_no
          ), 0
        )) as outstanding
      FROM grns g
      LEFT JOIN vendors v ON v.id = g.vendor_id
      ${whereConditions}
      ORDER BY g.grn_date DESC, g.id DESC
      LIMIT :limit OFFSET :offset
    `;

        // Get total count for pagination
        const countQuery = `
      SELECT COUNT(*) as total
      FROM grns g
      ${whereConditions}
    `;

        const [transactions, [countResult]] = await Promise.all([
            sequelize.query(query, { replacements }),
            sequelize.query(countQuery, {
                replacements: { vendor_id: replacements.vendor_id, start_date: replacements.start_date, end_date: replacements.end_date },
                type: sequelize.QueryTypes.SELECT,
            }),
        ]);

        const formattedTransactions = transactions[0].map((transaction) => ({
            id: transaction.id,
            grn_no: transaction.grn_no,
            date: transaction.grn_date,
            vendor_id: transaction.vendor_id,
            vendor_name: transaction.vendor_name,
            vendor_code: transaction.vendor_code,
            total_purchase: parseFloat(transaction.total_purchase).toFixed(2),
            total_paid: parseFloat(transaction.total_paid).toFixed(2),
            outstanding: parseFloat(transaction.outstanding).toFixed(2),
        }));

        return commonService.okResponse(res, {
            transactions: formattedTransactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.total),
                totalPages: Math.ceil(countResult.total / limit),
            },
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get vendor list with purchase and payment summary
 */
const getVendorList = async (req, res) => {
    try {
        const { page = 1, limit = 10, material_type, search, branch_id } = req.query;
        const offset = (page - 1) * limit;

        // Build filters
        let whereConditions = [];
        const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

        whereConditions.push("v.deleted_at IS NULL");

        if (material_type) {
            whereConditions.push(":material_type = ANY(v.material_type_ids)");
            replacements.material_type = parseInt(material_type);
        }

        if (search) {
            whereConditions.push("(v.vendor_name ILIKE :search OR v.vendor_code ILIKE :search)");
            replacements.search = `%${search}%`;
        }

        if (branch_id) {
            whereConditions.push(":branch_id = ANY(v.visibilities)");
            replacements.branch_id = parseInt(branch_id);
        }

        const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

        // Get vendor list with purchase and payment summary
        const query = `
      SELECT 
        v.id,
        v.vendor_code,
        v.vendor_name,
        v.vendor_image_url,
        v.status,
        v.visibilities,
        COALESCE(
          (
            SELECT SUM(g.total_amount)
            FROM grns g
            WHERE g.vendor_id = v.id AND g.deleted_at IS NULL
          ), 0
        ) as total_purchase,
        COALESCE(
          (
            SELECT SUM(vp.amount)
            FROM vendor_payments vp
            JOIN grns g ON g.grn_no = vp.ref_id
            WHERE vp.deleted_at IS NULL
              AND vp.status = 'Completed'
              AND g.vendor_id = v.id
              AND g.deleted_at IS NULL
          ), 0
        ) as total_paid,
        (
          COALESCE(
            (
              SELECT SUM(g.total_amount)
              FROM grns g
              WHERE g.vendor_id = v.id AND g.deleted_at IS NULL
            ), 0
          ) - COALESCE(
            (
              SELECT SUM(vp.amount)
              FROM vendor_payments vp
              JOIN grns g ON g.grn_no = vp.ref_id
              WHERE vp.deleted_at IS NULL
                AND vp.status = 'Completed'
                AND g.vendor_id = v.id
                AND g.deleted_at IS NULL
            ), 0
          )
        ) as outstanding
      FROM vendors v
      ${whereClause}
      ORDER BY v.id DESC
      LIMIT :limit OFFSET :offset
    `;

        // Get total count for pagination
        const countQuery = `
      SELECT COUNT(*) as total
      FROM vendors v
      ${whereClause}
    `;

        const [vendors, [countResult]] = await Promise.all([
            sequelize.query(query, { replacements }),
            sequelize.query(countQuery, {
                replacements: { material_type: replacements.material_type, search: replacements.search, branch_id: replacements.branch_id },
                type: sequelize.QueryTypes.SELECT,
            }),
        ]);

        // Get branch names for visibilities
        const formattedVendors = await Promise.all(
            vendors[0].map(async (vendor) => {
                let branchName = "All Branches";
                if (vendor.visibilities && vendor.visibilities.length > 0) {
                    // visibilities is already an array, use it directly
                    const branchQuery = `
            SELECT branch_name 
            FROM branches 
            WHERE id = ANY($1::int[]) AND deleted_at IS NULL
            LIMIT 1
          `;
                    const [branches] = await sequelize.query(branchQuery, {
                        bind: [vendor.visibilities],
                    });
                    if (branches.length > 0) {
                        branchName = branches[0].branch_name;
                    }
                }

                return {
                    id: vendor.id,
                    vendor_code: vendor.vendor_code,
                    vendor_name: vendor.vendor_name,
                    vendor_image_url: vendor.vendor_image_url,
                    status: vendor.status,
                    total_purchase: parseFloat(vendor.total_purchase).toFixed(2),
                    total_paid: parseFloat(vendor.total_paid).toFixed(2),
                    outstanding: parseFloat(vendor.outstanding).toFixed(2),
                    branch: branchName,
                };
            })
        );

        return commonService.okResponse(res, {
            vendors: formattedVendors,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.total),
                totalPages: Math.ceil(countResult.total / limit),
            },
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get vendor overview/details (comprehensive vendor metrics)
 */
const getVendorOverview = async (req, res) => {
    try {
        const { vendor_id, start_date, end_date } = req.query;

        if (!vendor_id) {
            return res.status(400).json({
                statusCode: 400,
                message: "vendor_id is required",
            });
        }

        // Build date filter
        let dateFilter = "";
        const replacements = { vendor_id: parseInt(vendor_id) };

        if (start_date && end_date) {
            dateFilter = " AND DATE BETWEEN CAST(:start_date AS DATE) AND CAST(:end_date AS DATE)";
            replacements.start_date = start_date;
            replacements.end_date = end_date;
        } else if (start_date) {
            dateFilter = " AND DATE >= CAST(:start_date AS DATE)";
            replacements.start_date = start_date;
        } else if (end_date) {
            dateFilter = " AND DATE <= CAST(:end_date AS DATE)";
            replacements.end_date = end_date;
        }

        // Get vendor basic info
        const vendorQuery = `
      SELECT id, vendor_code, vendor_name, vendor_image_url, proprietor_name, mobile, address
      FROM vendors
      WHERE id = :vendor_id AND deleted_at IS NULL
    `;

        // Purchase Order metrics (from purchase_orders table if exists, or use GRNs)
        const purchaseOrderQuery = `
      SELECT 
        COALESCE(SUM(gi.gross_wt_in_g), 0) as total_weight
      FROM grns g
      JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
      WHERE g.vendor_id = :vendor_id 
        AND g.deleted_at IS NULL
        ${dateFilter.replace('DATE', 'g.grn_date')}
    `;

        // GRN Value (weight)
        const grnValueQuery = `
      SELECT 
        COALESCE(SUM(gi.gross_wt_in_g), 0) as grn_weight
      FROM grns g
      JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
      WHERE g.vendor_id = :vendor_id 
        AND g.deleted_at IS NULL
        ${dateFilter.replace('DATE', 'g.grn_date')}
    `;

        // Purchase Order Value (total amount)
        const purchaseValueQuery = `
      SELECT 
        COALESCE(SUM(g.total_amount), 0) as total_value
      FROM grns g
      WHERE g.vendor_id = :vendor_id 
        AND g.deleted_at IS NULL
        ${dateFilter.replace('DATE', 'g.grn_date')}
    `;

        // Total Amount Paid
        const totalPaidQuery = `
      SELECT 
        COALESCE(SUM(vp.amount), 0) as total_paid
      FROM vendor_payments vp
      JOIN grns g ON g.grn_no = vp.ref_id
      WHERE g.vendor_id = :vendor_id
        AND vp.status = 'Completed'
        AND vp.deleted_at IS NULL
        AND g.deleted_at IS NULL
        ${dateFilter.replace('DATE', 'vp.payment_date')}
    `;

        // Purchase Values for chart - supports monthly, yearly, weekly
        const { period = 'monthly' } = req.query;
        let purchaseValuesQuery = '';

        if (period === 'monthly') {
            // Monthly: JAN to DEC
            purchaseValuesQuery = `
        SELECT 
          TO_CHAR(g.grn_date, 'MON') as label,
          EXTRACT(MONTH FROM g.grn_date) as sort_order,
          COALESCE(SUM(g.total_amount), 0) as total_value
        FROM grns g
        WHERE g.vendor_id = :vendor_id 
          AND g.deleted_at IS NULL
          ${dateFilter.replace('DATE', 'g.grn_date')}
        GROUP BY TO_CHAR(g.grn_date, 'MON'), EXTRACT(MONTH FROM g.grn_date)
        ORDER BY sort_order
      `;
        } else if (period === 'yearly') {
            // Yearly: by year
            purchaseValuesQuery = `
        SELECT 
          EXTRACT(YEAR FROM g.grn_date)::text as label,
          EXTRACT(YEAR FROM g.grn_date) as sort_order,
          COALESCE(SUM(g.total_amount), 0) as total_value
        FROM grns g
        WHERE g.vendor_id = :vendor_id 
          AND g.deleted_at IS NULL
          ${dateFilter.replace('DATE', 'g.grn_date')}
        GROUP BY EXTRACT(YEAR FROM g.grn_date)
        ORDER BY sort_order
      `;
        } else if (period === 'weekly') {
            // Weekly: SUN to SAT
            purchaseValuesQuery = `
        SELECT 
          TO_CHAR(g.grn_date, 'DY') as label,
          EXTRACT(DOW FROM g.grn_date) as sort_order,
          COALESCE(SUM(g.total_amount), 0) as total_value
        FROM grns g
        WHERE g.vendor_id = :vendor_id 
          AND g.deleted_at IS NULL
          ${dateFilter.replace('DATE', 'g.grn_date')}
        GROUP BY TO_CHAR(g.grn_date, 'DY'), EXTRACT(DOW FROM g.grn_date)
        ORDER BY sort_order
      `;
        }

        // Execute all queries in parallel
        const [
            [vendorInfo],
            [purchaseOrderResult],
            [grnValueResult],
            [purchaseValueResult],
            [totalPaidResult],
            purchaseValues,
        ] = await Promise.all([
            sequelize.query(vendorQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(purchaseOrderQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(grnValueQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(purchaseValueQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(totalPaidQuery, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(purchaseValuesQuery, { replacements }),
        ]);

        if (!vendorInfo) {
            return res.status(404).json({
                statusCode: 404,
                message: "Vendor not found",
            });
        }

        // Calculate outstanding
        const totalValue = parseFloat(purchaseValueResult.total_value) || 0;
        const totalPaid = parseFloat(totalPaidResult.total_paid) || 0;
        const outstanding = totalValue - totalPaid;

        // Format purchase values based on period
        let formattedPurchaseValues = [];

        if (period === 'monthly') {
            // All 12 months
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const dataMap = {};
            purchaseValues[0].forEach(item => {
                dataMap[item.label.toUpperCase()] = parseFloat(item.total_value).toFixed(2);
            });
            formattedPurchaseValues = months.map(month => ({
                label: month,
                value: dataMap[month] || "0.00"
            }));
        } else if (period === 'weekly') {
            // All 7 days: SUN to SAT
            const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const dataMap = {};
            purchaseValues[0].forEach(item => {
                dataMap[item.label.toUpperCase()] = parseFloat(item.total_value).toFixed(2);
            });
            formattedPurchaseValues = days.map(day => ({
                label: day,
                value: dataMap[day] || "0.00"
            }));
        } else if (period === 'yearly') {
            // Years as returned from query
            formattedPurchaseValues = purchaseValues[0].map(item => ({
                label: item.label,
                value: parseFloat(item.total_value).toFixed(2)
            }));
        }

        return commonService.okResponse(res, {
            vendor_info: {
                id: vendorInfo.id,
                vendor_code: vendorInfo.vendor_code,
                vendor_name: vendorInfo.vendor_name,
                vendor_image_url: vendorInfo.vendor_image_url,
                proprietor_name: vendorInfo.proprietor_name,
                mobile: vendorInfo.mobile,
                address: vendorInfo.address,
            },
            metrics: {
                purchase_order: parseFloat(purchaseOrderResult.total_weight).toFixed(2) + " g",
                grn_value: parseFloat(grnValueResult.grn_weight).toFixed(2) + " g",
                purchase_order_value: parseFloat(purchaseValueResult.total_value).toFixed(2),
                total_amount_paid: totalPaid.toFixed(2),
                outstanding_amount: outstanding.toFixed(2),
            },
            purchase_values: formattedPurchaseValues,
            period: period,
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get vendor purchase by category
 */
const getVendorPurchaseByCategory = async (req, res) => {
    try {
        const { vendor_id, period = 'monthly', start_date, end_date } = req.query;

        if (!vendor_id) {
            return res.status(400).json({
                statusCode: 400,
                message: "vendor_id is required",
            });
        }

        // Build date filter
        let dateFilter = "";
        const replacements = { vendor_id: parseInt(vendor_id) };

        if (start_date && end_date) {
            dateFilter = " AND g.grn_date BETWEEN CAST(:start_date AS DATE) AND CAST(:end_date AS DATE)";
            replacements.start_date = start_date;
            replacements.end_date = end_date;
        } else if (start_date) {
            dateFilter = " AND g.grn_date >= CAST(:start_date AS DATE)";
            replacements.start_date = start_date;
        } else if (end_date) {
            dateFilter = " AND g.grn_date <= CAST(:end_date AS DATE)";
            replacements.end_date = end_date;
        }

        // Query to get purchase by category for the vendor
        const query = `
      SELECT 
        c.id,
        c.category_name,
        c.category_image_url,
        COALESCE(SUM(gi.gross_wt_in_g), 0) as total_weight,
        COALESCE(SUM(gi.total_amount), 0) as total_value,
        COUNT(gi.id) as item_count
      FROM categories c
      LEFT JOIN "grnItems" gi ON gi.category_id = c.id AND gi.deleted_at IS NULL
      LEFT JOIN grns g ON g.id = gi.grn_id AND g.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
        AND (g.vendor_id = :vendor_id OR g.vendor_id IS NULL)
        ${dateFilter}
      GROUP BY c.id, c.category_name, c.category_image_url
      HAVING COALESCE(SUM(gi.gross_wt_in_g), 0) > 0
      ORDER BY total_weight DESC
    `;

        const [categories] = await sequelize.query(query, { replacements });

        const formattedCategories = categories.map((category) => ({
            id: category.id,
            category_name: category.category_name,
            category_image_url: category.category_image_url,
            weight: parseFloat(category.total_weight).toFixed(2) + " Kg",
            total_value: parseFloat(category.total_value).toFixed(2),
            item_count: parseInt(category.item_count),
        }));

        return commonService.okResponse(res, {
            categories: formattedCategories,
            period: period,
            total_categories: formattedCategories.length,
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

/**
 * Get comprehensive vendor dashboard (all metrics in one response)
 * Supports optional filters: branch_id, start_date, end_date
 */
const getVendorDashboard = async (req, res) => {
    try {
        const { branch_id, start_date, end_date } = req.query;

        // Build date filter condition
        let dateFilter = "";
        let dateReplacements = {};

        if (start_date && end_date) {
            dateFilter = " AND g.grn_date BETWEEN CAST(:start_date AS DATE) AND CAST(:end_date AS DATE)";
            dateReplacements = { start_date, end_date };
        } else if (start_date) {
            dateFilter = " AND g.grn_date >= CAST(:start_date AS DATE)";
            dateReplacements = { start_date };
        } else if (end_date) {
            dateFilter = " AND g.grn_date <= CAST(:end_date AS DATE)";
            dateReplacements = { end_date };
        }

        // Build branch filter condition
        // Build branch filter condition
        let branchFilter = "";
        const replacements = { ...dateReplacements }; // Initialize replacements with dateReplacements
        if (branch_id) {
            branchFilter = " AND :branch_id = ANY(v.visibilities)";
            replacements.branch_id = parseInt(branch_id);
        }

        // 1. Total Vendors
        const totalVendorsQuery = `
      SELECT COUNT(DISTINCT v.id) as total_vendors
      FROM vendors v
      WHERE v.deleted_at IS NULL
      ${branchFilter}
    `;

        // 2. Active Vendors
        const activeVendorsQuery = `
      SELECT COUNT(DISTINCT v.id) as active_vendors
      FROM vendors v
      WHERE v.deleted_at IS NULL
        AND v.status = 'Active'
      ${branchFilter}
    `;

        // 3. Outstanding Payables
        const outstandingPayablesQuery = `
      SELECT 
        COALESCE(SUM(g.total_amount), 0) as total_grn_amount,
        (
          SELECT COALESCE(SUM(vp.amount), 0)
          FROM vendor_payments vp
          WHERE vp.deleted_at IS NULL
            AND vp.status = 'Completed'
            ${start_date || end_date ? `AND vp.payment_date BETWEEN CAST(COALESCE(:start_date, '1900-01-01') AS DATE) AND CAST(COALESCE(:end_date, '2100-12-31') AS DATE)` : ''}
            ${branch_id ? 'AND vp.branch_id = :branch_id' : ''}
        ) as total_payments
      FROM grns g
      JOIN vendors v ON v.id = g.vendor_id
      WHERE g.deleted_at IS NULL
      ${dateFilter}
      ${branchFilter}
    `;

        // 4. Vendor Sales Contribution (with Purchase & Sales data)
        const salesContributionQuery = `
      SELECT 
        v.id,
        v.vendor_name,
        v.vendor_code,
        v.vendor_image_url,
        -- Purchase metrics (from GRN)
        COALESCE(SUM(CASE WHEN mt.material_type = 'Gold' THEN gi.gross_wt_in_g ELSE 0 END), 0) as gold_weight,
        COALESCE(SUM(CASE WHEN mt.material_type = 'Silver' THEN gi.gross_wt_in_g ELSE 0 END), 0) as silver_weight,
        COALESCE(SUM(gi.total_amount), 0) as total_purchase,
        -- Sales metrics (from Sales Invoice Bills)
        COALESCE(
          (
            SELECT SUM(sibi.amount)
            FROM sales_invoice_bill_items sibi
            JOIN products p ON p.id = sibi.product_id AND p.deleted_at IS NULL
            JOIN sales_invoice_bills sib ON sib.id = sibi.invoice_bill_id AND sib.deleted_at IS NULL
            WHERE p.vendor_id = v.id
              AND sibi.deleted_at IS NULL
              AND sib.status != 'Cancelled'
          ), 0
        ) as total_sales,
        -- Payment metrics (from Vendor Payments - filtered by same date and branch criteria)
        COALESCE(
          (
            SELECT SUM(vp.amount)
            FROM vendor_payments vp
            JOIN grns g2 ON g2.grn_no = vp.ref_id AND g2.deleted_at IS NULL
            WHERE vp.deleted_at IS NULL
              AND vp.status = 'Completed'
              AND g2.vendor_id = v.id
              ${dateFilter ? dateFilter.replace('g.grn_date', 'vp.payment_date') : ''}
              ${branch_id ? 'AND vp.branch_id = :branch_id' : ''}
          ), 0
        ) as total_paid
      FROM vendors v
      LEFT JOIN grns g ON g.vendor_id = v.id 
        AND g.deleted_at IS NULL
        ${dateFilter}
      LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
      LEFT JOIN "materialTypes" mt ON mt.id = gi.material_type_id AND mt.deleted_at IS NULL
      WHERE v.deleted_at IS NULL
      ${branchFilter}
      GROUP BY v.id, v.vendor_name, v.vendor_code, v.vendor_image_url
      HAVING COALESCE(SUM(gi.total_amount), 0) > 0
      ORDER BY total_purchase DESC
    `;

        // 5. Purchase by Material Type
        const purchaseByMaterialQuery = `
      SELECT 
        mt.id,
        mt.material_type,
        COALESCE(SUM(gi.gross_wt_in_g), 0) as total_weight,
        COUNT(gi.id) as item_count
      FROM "materialTypes" mt
      LEFT JOIN "grnItems" gi ON gi.material_type_id = mt.id 
        AND gi.deleted_at IS NULL
      LEFT JOIN grns g ON g.id = gi.grn_id
        AND g.deleted_at IS NULL
        ${dateFilter}
      LEFT JOIN vendors v ON v.id = g.vendor_id
      WHERE mt.deleted_at IS NULL
      ${branchFilter}
      GROUP BY mt.id, mt.material_type
      HAVING COALESCE(SUM(gi.gross_wt_in_g), 0) > 0
      ORDER BY total_weight DESC
    `;

        // Execute all queries in parallel
        const [
            totalVendorResult,
            activeVendorResult,
            outstandingResult,
            salesContribution,
            purchaseByMaterial,
        ] = await Promise.all([
            sequelize.query(totalVendorsQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            }),
            sequelize.query(activeVendorsQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            }),
            sequelize.query(outstandingPayablesQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            }),
            sequelize.query(salesContributionQuery, {
                replacements,
            }),
            sequelize.query(purchaseByMaterialQuery, {
                replacements,
            }),
        ]);

        // Format outstanding payables
        const totalGrnAmount = parseFloat(outstandingResult[0].total_grn_amount) || 0;
        const totalPayments = parseFloat(outstandingResult[0].total_payments) || 0;
        const outstandingPayables = totalGrnAmount - totalPayments;

        // Format vendor sales contribution
        const formattedVendors = salesContribution[0].map((vendor) => {
            const totalPurchase = parseFloat(vendor.total_purchase) || 0;
            const totalSales = parseFloat(vendor.total_sales) || 0;
            const totalPaid = parseFloat(vendor.total_paid) || 0;
            const outstandingPayment = totalPurchase - totalPaid;
            
            return {
                id: vendor.id,
                vendor_name: vendor.vendor_name,
                vendor_code: vendor.vendor_code,
                vendor_image_url: vendor.vendor_image_url,
                gold: parseFloat(vendor.gold_weight).toFixed(2) + " g",
                silver: parseFloat(vendor.silver_weight).toFixed(2) + " g",
                total_purchase: totalPurchase.toFixed(2),
                total_sales: totalSales.toFixed(2),
                total_paid: totalPaid.toFixed(2),
                outstanding: outstandingPayment.toFixed(2),
                profit_margin: totalSales > 0 ? ((totalSales - totalPurchase) / totalSales * 100).toFixed(2) : "0.00",
            };
        });

        // Format purchase by material with percentages
        const materials = purchaseByMaterial[0];
        const totalWeight = materials.reduce((sum, m) => sum + parseFloat(m.total_weight), 0);

        const formattedMaterials = materials.map((material) => {
            const weight = parseFloat(material.total_weight);
            const percentage = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
            return {
                id: material.id,
                material_type: material.material_type,
                total_weight: weight.toFixed(2),
                item_count: parseInt(material.item_count),
                percentage: percentage.toFixed(2),
            };
        });

        // Return comprehensive dashboard data
        return commonService.okResponse(res, {
            filters: {
                branch_id: branch_id ? parseInt(branch_id) : null,
                start_date: start_date || null,
                end_date: end_date || null,
            },
            metrics: {
                total_vendors: parseInt(totalVendorResult[0].total_vendors),
                active_vendors: parseInt(activeVendorResult[0].active_vendors),
                total_purchase: totalGrnAmount.toFixed(2),
                total_paid: totalPayments.toFixed(2),
                outstanding_payables: {
                    amount: outstandingPayables.toFixed(2),
                    total_grn_amount: totalGrnAmount.toFixed(2),
                    total_payments: totalPayments.toFixed(2),
                },
            },
            vendor_sales_contribution: formattedVendors,
            purchase_by_material: {
                materials: formattedMaterials,
                total_weight: totalWeight.toFixed(2),
            },
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

module.exports = {
    getTotalVendorCount,
    getActiveVendorCount,
    getOutstandingPayables,
    getVendorSalesContribution,
    getPurchaseByMaterialType,
    getTopBuyingCategories,
    getTransactionHistory,
    getVendorList,
    getVendorOverview,
    getVendorPurchaseByCategory,
    getVendorDashboard,
};
