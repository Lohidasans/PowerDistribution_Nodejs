const { Op } = require('sequelize');
const commonService = require('./commonService');
const { models, sequelize } = require('../models/index');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create a new old jewel record with items
const createOldJewel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items = [], ...jewelData } = req.body;
    
    // Calculate totalAmount from items
    const totalAmount = items.reduce((sum, item) => {
      return sum + (parseFloat(item.amount) || 0);
    }, 0);
        
    // Create the main jewel record with calculated values
    const jewel = await models.OldJewel.create({
      ...jewelData,
      total_amount: totalAmount,
      date: jewelData.date || new Date().toISOString().split('T')[0],
      time: jewelData.time || null,
      discount_type: jewelData.discount_type 
    }, { transaction });
    
    // Create jewel items if any
    if (items && items.length > 0) {
      const jewelItems = items.map(item => {
        const grsWeight = parseFloat(item.grs_weight) || 0;
        const wastage = parseFloat(item.wastage) || 0;
        const dustWeight = parseFloat(item.dust_weight) || 0;

        // ---- Correct net weight calculation ----
        const netWeight = grsWeight - wastage - dustWeight;

        return {
          ...item,
          old_jewel_id: jewel.id,
          grs_weight: grsWeight,
          wastage,
          dust_weight: dustWeight,
          net_weight: netWeight,
          rate: parseFloat(item.rate) || 0,
          amount: parseFloat(item.amount) || 0
        };
      });
      
      await models.OldJewelItem.bulkCreate(jewelItems, { transaction });
    }
    
    await transaction.commit();
    
    // Fetch the created record with its items
    const [jewelRecord, jewelItems] = await Promise.all([
      models.OldJewel.findByPk(jewel.id),
      models.OldJewelItem.findAll({ where: { old_jewel_id: jewel.id }})
    ]);
    
    const result = {
      ...jewelRecord.get({ plain: true }),
      items: jewelItems
    };
    
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating old jewel:', error);
    return commonService.handleError(res, error);
  }
};

const getAllOldJewels = async (req, res) => {
  try {
    const { old_jewel_code } = req.query;

    const replacements = {};
    let whereSql = `oj.deleted_at IS NULL`;

    if (old_jewel_code) {
      whereSql += ` AND oj.old_jewel_code = :old_jewel_code`;
      replacements.old_jewel_code = old_jewel_code;
    }

    // 1️. Fetch old jewels with employee & customer info
    const jewels = await sequelize.query(
      `
      SELECT
        oj.*,
        emp.employee_no,
        emp.employee_name,
        c.customer_name,
        c.mobile_number AS customer_mobile
      FROM old_jewels oj
      LEFT JOIN employees emp ON emp.id = oj.employee_id AND emp.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = oj.customer_id AND c.deleted_at IS NULL
      WHERE ${whereSql}
      ORDER BY oj.id DESC
      `,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!jewels || jewels.length === 0) {
      return commonService.okResponse(res, { data: [] });
    }

    // 2️. Fetch all items for these jewels
    const jewelIds = jewels.map(j => j.id);
    const items = await sequelize.query(
      `
      SELECT *
      FROM old_jewel_items
      WHERE deleted_at IS NULL
        AND old_jewel_id IN (:jewelIds)
      ORDER BY old_jewel_id ASC, id ASC
      `,
      {
        replacements: { jewelIds },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // 3️. Group items by old_jewel_id
    const itemsMap = items.reduce((acc, item) => {
      if (!acc[item.old_jewel_id]) acc[item.old_jewel_id] = [];
      acc[item.old_jewel_id].push(item);
      return acc;
    }, {});

    // 4️. Final response formatting
    const result = jewels.map(jewel => {
      const jewelItems = itemsMap[jewel.id] || [];

      const totalNetWeight = jewelItems.reduce(
        (sum, it) => sum + (parseFloat(it.net_weight) || 0),
        0
      );
      const quantityCount = jewelItems.length;

      return {
        ...jewel,
        total_net_weight: totalNetWeight.toFixed(3),
        quantity_count: quantityCount,
        items: jewelItems,
      };
    });

    return commonService.okResponse(res, { data: result });
  } catch (error) {
    console.error("Error fetching Old Jewels:", error);
    return commonService.handleError(res, error);
  }
};

// Get a single old jewel record by ID
const getOldJewelById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [jewel, items] = await Promise.all([
      models.OldJewel.findByPk(id, { raw: true }),
      models.OldJewelItem.findAll({ 
        where: { old_jewel_id: id },
        raw: true
      })
    ]);
    
    if (!jewel) {
      return commonService.notFound(res, 'Old jewel record not found');
    }
    
    const result = {
      ...jewel,
      items: items || []
    };
    
    return commonService.okResponse(res, result);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update Old Jewel and its items
const updateOldJewel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const oldJewelId = req.params.id;
    const { items = [], ...jewelData } = req.body || {};

    // 1. FETCH & VALIDATE OLD JEWEL
    const oldJewel = await models.OldJewel.findByPk(oldJewelId, {
      transaction
    });

    if (!oldJewel) {
      await transaction.rollback();``
      return commonService.notFound(res, "Old jewel not found");
    }

    if (oldJewel.status != "On Hold") {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "Finalized invoice cannot be edited"
      );
    }

    // 2. ITEMS VALIDATION
    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "At least one item is required"
      );
    }

    // 3. CALCULATE TOTAL & ITEM VALUES
    let totalAmount = 0;

    const itemRows = items.map(item => {
      const grsWeight = parseFloat(item.grs_weight) || 0;
      const wastage = parseFloat(item.wastage) || 0;
      const dustWeight = parseFloat(item.dust_weight) || 0;

      // Net weight calculation (backend controlled)
      const netWeight = grsWeight - wastage - dustWeight;

      const rate = parseFloat(item.rate) || 0;
      const amount =
        item.amount !== undefined
          ? parseFloat(item.amount)
          : netWeight * rate;

      totalAmount += amount;

      return {
        id: item.id || null,
        hsn_code: item.hsn_code || null,
        jewel_description: item.jewel_description || null,
        grs_weight: grsWeight,
        wastage,
        dust_weight: dustWeight,
        net_weight: netWeight,
        rate,
        amount
      };
    });

    // 4. UPDATE OLD JEWEL HEADER
    await oldJewel.update(
      {
        old_jewel_code: jewelData.old_jewel_code ?? oldJewel.old_jewel_code,
        employee_id: jewelData.employee_id,
        customer_id: jewelData.customer_id,
        date: jewelData.date || oldJewel.date,
        time: jewelData.time || oldJewel.time,
        status: jewelData.status || oldJewel.status,
        discount_type: jewelData.discount_type ?? oldJewel.discount_type,
        total_amount: totalAmount
      },
      { transaction }
    );

    // 5. UPSERT OLD JEWEL ITEMS
    const existingItems = await models.OldJewelItem.findAll({
      where: { old_jewel_id: oldJewel.id },
      transaction
    });

    const payloadItemIds = itemRows
      .filter(i => i.id)
      .map(i => i.id);

    // DELETE omitted items
    await models.OldJewelItem.destroy({
      where: {
        old_jewel_id: oldJewel.id,
        id: { [Op.notIn]: payloadItemIds }
      },
      transaction
    });

    // UPSERT items
    for (const row of itemRows) {
      if (row.id) {
        await models.OldJewelItem.update(
          {
            hsn_code: row.hsn_code,
            jewel_description: row.jewel_description,
            grs_weight: row.grs_weight,
            wastage: row.wastage,
            dust_weight: row.dust_weight,
            net_weight: row.net_weight,
            rate: row.rate,
            amount: row.amount
          },
          {
            where: { id: row.id },
            transaction
          }
        );
      } else {
        await models.OldJewelItem.create(
          {
            ...row,
            old_jewel_id: oldJewel.id
          },
          { transaction }
        );
      }
    }

    await transaction.commit();
    return commonService.okResponse(res, {
      message: "Old jewel updated successfully"
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Error updating old jewel:", error);
    return commonService.handleError(res, error);
  }
};

// Delete an old jewel record (soft delete)
const deleteOldJewel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    
    const jewel = await models.OldJewel.findByPk(id, { transaction });
    
    if (!jewel) {
      await transaction.rollback();
      return commonService.notFound(res, 'Old jewel record not found');
    }
    
    // Soft delete the jewel record (paranoid: true will handle this)
    await jewel.destroy({ transaction });
    
    // Also soft delete associated items
    await models.OldJewelItem.destroy({
      where: { old_jewel_id: id },
      transaction
    });
    
    await transaction.commit();
    
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

const generateOldJewelCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.OldJewel,
      "old_jewel_code",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { old_jewel_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listOldJewelDropdown = async (req, res) => {
  try {
    const { customer_id } = req.query;
    const where = { is_bill_adjusted: false, };

    if (customer_id) {
      where.customer_id = customer_id; // apply filter only if passed
    }

    const rows = await models.OldJewel.findAll({
      attributes: ["id", "old_jewel_code", "customer_id"],
      where, // <-- applied here
      order: [["old_jewel_code", "ASC"]],
    });

    return commonService.okResponse(res, { old_jewel_code: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


module.exports = {
  createOldJewel,
  getAllOldJewels,
  getOldJewelById,
  updateOldJewel,
  deleteOldJewel,
  generateOldJewelCode,
  listOldJewelDropdown
};
