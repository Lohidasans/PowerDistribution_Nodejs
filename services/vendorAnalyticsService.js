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
        let branchFilter = "";
        let branchReplacements = {};

        if (branch_id) {
            branchFilter = " AND :branch_id = ANY(v.visibilities)";
            branchReplacements = { branch_id: parseInt(branch_id) };
        }

        const replacements = { ...dateReplacements, ...branchReplacements };

        // 1. Total Vendor Count
        const totalVendorQuery = `
      SELECT COUNT(DISTINCT v.id) as total_vendors
      FROM vendors v
      WHERE v.deleted_at IS NULL
      ${branchFilter}
    `;

        // 2. Active Vendor Count
        const activeVendorQuery = `
      SELECT COUNT(DISTINCT v.id) as active_vendors
      FROM vendors v
      WHERE v.status = 'Active' 
        AND v.deleted_at IS NULL
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

        // 4. Vendor Sales Contribution
        const salesContributionQuery = `
      SELECT 
        v.id,
        v.vendor_name,
        v.vendor_code,
        v.vendor_image_url,
        COALESCE(SUM(CASE WHEN mt.material_type = 'Gold' THEN gi.gross_wt_in_g ELSE 0 END), 0) as gold_weight,
        COALESCE(SUM(CASE WHEN mt.material_type = 'Silver' THEN gi.gross_wt_in_g ELSE 0 END), 0) as silver_weight,
        COALESCE(SUM(g.total_amount), 0) as total_value
      FROM vendors v
      LEFT JOIN grns g ON g.vendor_id = v.id 
        AND g.deleted_at IS NULL
        ${dateFilter}
      LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
      LEFT JOIN "materialTypes" mt ON mt.id = gi.material_type_id AND mt.deleted_at IS NULL
      WHERE v.deleted_at IS NULL
      ${branchFilter}
      GROUP BY v.id, v.vendor_name, v.vendor_code, v.vendor_image_url
      HAVING COALESCE(SUM(g.total_amount), 0) > 0
      ORDER BY total_value DESC
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
            [totalVendorResult],
            [activeVendorResult],
            [outstandingResult],
            salesContribution,
            purchaseByMaterial,
        ] = await Promise.all([
            sequelize.query(totalVendorQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            }),
            sequelize.query(activeVendorQuery, {
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
        const totalGrnAmount = parseFloat(outstandingResult.total_grn_amount) || 0;
        const totalPayments = parseFloat(outstandingResult.total_payments) || 0;
        const outstandingPayables = totalGrnAmount - totalPayments;

        // Format vendor sales contribution
        const formattedVendors = salesContribution[0].map((vendor) => ({
            id: vendor.id,
            vendor_name: vendor.vendor_name,
            vendor_code: vendor.vendor_code,
            vendor_image_url: vendor.vendor_image_url,
            gold: parseFloat(vendor.gold_weight).toFixed(2) + " g",
            silver: parseFloat(vendor.silver_weight).toFixed(2) + " g",
            total_value: parseFloat(vendor.total_value).toFixed(2),
        }));

        // Format purchase by material with percentages
        const totalWeight = purchaseByMaterial[0].reduce(
            (sum, material) => sum + parseFloat(material.total_weight),
            0
        );

        const formattedMaterials = purchaseByMaterial[0].map((material) => {
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
                branch_id: branch_id || null,
                start_date: start_date || null,
                end_date: end_date || null,
            },
            metrics: {
                total_vendors: parseInt(totalVendorResult.total_vendors),
                active_vendors: parseInt(activeVendorResult.active_vendors),
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
    getVendorDashboard,
};
