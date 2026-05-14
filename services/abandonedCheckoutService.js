const { models, sequelize } = require('../models');
const { dateFilter } = require('../helpers/dateHelper');
const { QueryTypes } = require('sequelize');

// ─── LOG ABANDONED EVENT (Customer Side) ────────────────────────────────────
const logAbandonedEvent = async (req, res) => {
    try {
        const {
            user_id,
            customer_name,
            customer_email,
            customer_phone,
            product_id,
            product_name,
            product_image,
            behaviour,
        } = req.body;

        if (!behaviour) {
            return res.status(400).json({ message: 'behaviour is required' });
        }

        const record = await models.AbandonedCheckout.create({
            user_id: user_id || null,
            customer_name: customer_name || null,
            customer_email: customer_email || null,
            customer_phone: customer_phone || null,
            product_id: product_id || null,
            product_name: product_name || null,
            product_image: product_image || null,
            behaviour,
            contact_status: 'Not Contacted',
            phone_status: 'Pending',
            email_status: 'Not Sent',
        });

        return res.status(201).json({ message: 'Logged successfully', data: record });
    } catch (err) {
        console.error('logAbandonedEvent error:', err);
        return res.status(500).json({ message: err.message });
    }
};

// ─── GET STATS (Total / Not Contacted / Contacted) ──────────────────────────
const getAbandonedStats = async (req, res) => {
    try {
        const { from_date, to_date, date_filter } = req.query;
        const replacements = {};

        let dateWhere = '';
        if (from_date || to_date || date_filter) {
            dateWhere = dateFilter(
                { from_date, to_date, date_filter },
                'ac.created_at',
                replacements
            );
        }

        const [stats] = await sequelize.query(
            `SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE ac.contact_status = 'Not Contacted') AS not_contacted,
                COUNT(*) FILTER (WHERE ac.contact_status = 'Contacted') AS contacted
            FROM abandoned_checkouts ac
            WHERE ac.deleted_at IS NULL
            ${dateWhere}`,
            { replacements, type: QueryTypes.SELECT }
        );

        return res.status(200).json({
            total: parseInt(stats.total) || 0,
            not_contacted: parseInt(stats.not_contacted) || 0,
            contacted: parseInt(stats.contacted) || 0,
        });
    } catch (err) {
        console.error('getAbandonedStats error:', err);
        return res.status(500).json({ message: err.message });
    }
};

// ─── LIST ABANDONED CHECKOUTS (Admin) ───────────────────────────────────────
const getAbandonedList = async (req, res) => {
    try {
        const {
            search,
            from_date,
            to_date,
            date_filter,
            contact_status,
            page,
            limit,
        } = req.query;

        const pageNum = parseInt(page || 1, 10);
        const limitNum = parseInt(limit || 10, 10);
        const offset = (pageNum - 1) * limitNum;
        const replacements = {};

        let whereClause = `WHERE ac.deleted_at IS NULL`;

        if (contact_status) {
            whereClause += ` AND ac.contact_status::text = :contact_status`;
            replacements.contact_status = contact_status;
        }

        if (search) {
            whereClause += ` AND (
                ac.customer_name ILIKE :search OR
                ac.customer_email ILIKE :search OR
                ac.customer_phone ILIKE :search OR
                ac.product_name ILIKE :search
            )`;
            replacements.search = `%${search}%`;
        }

        if (from_date || to_date || date_filter) {
            whereClause += dateFilter(
                { from_date, to_date, date_filter },
                'ac.created_at',
                replacements
            );
        }

        const countQuery = `
            SELECT COUNT(*) AS total
            FROM abandoned_checkouts ac
            ${whereClause}
        `;

        const dataQuery = `
            SELECT
                ac.id,
                ac.user_id,
                ac.customer_name,
                ac.customer_email,
                ac.customer_phone,
                ac.product_id,
                ac.product_name,
                ac.product_image,
                ac.behaviour,
                ac.contact_status,
                ac.phone_status,
                ac.email_status,
                ac.response,
                ac.remarks,
                ac.created_at
            FROM abandoned_checkouts ac
            ${whereClause}
            ORDER BY ac.created_at DESC
            LIMIT :limit OFFSET :offset
        `;

        replacements.limit = limitNum;
        replacements.offset = offset;

        const [countResult] = await sequelize.query(countQuery, {
            replacements,
            type: QueryTypes.SELECT,
        });

        const rows = await sequelize.query(dataQuery, {
            replacements,
            type: QueryTypes.SELECT,
        });

        return res.status(200).json({
            data: rows,
            total: parseInt(countResult.total) || 0,
            page: pageNum,
            limit: limitNum,
        });
    } catch (err) {
        console.error('getAbandonedList error:', err);
        return res.status(500).json({ message: err.message });
    }
};

// ─── UPDATE STATUS (Admin) ───────────────────────────────────────────────────
const updateAbandonedStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            contact_status,
            phone_status,
            email_status,
            response,
            remarks,
            updated_by,
        } = req.body;

        const record = await models.AbandonedCheckout.findOne({
            where: { id },
        });

        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        await record.update({
            contact_status: contact_status || record.contact_status,
            phone_status: phone_status || record.phone_status,
            email_status: email_status || record.email_status,
            response: response || record.response,
            remarks: remarks !== undefined ? remarks : record.remarks,
            updated_by: updated_by || record.updated_by,
        });

        return res.status(200).json({ message: 'Updated successfully', data: record });
    } catch (err) {
        console.error('updateAbandonedStatus error:', err);
        return res.status(500).json({ message: err.message });
    }
};

module.exports = {
    logAbandonedEvent,
    getAbandonedStats,
    getAbandonedList,
    updateAbandonedStatus,
};
