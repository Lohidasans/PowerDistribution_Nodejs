const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

const createJournalEntry = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items = [], ...payload } = req.body;

    /* ================= VALIDATION ================= */

    if (
      !payload.journal_no ||
      !payload.date ||
      !payload.branch_id ||
      payload.total === undefined
    ) {
      await t.rollback();
      return commonService.badRequest(
        res,
        message.journal_entry?.required ||
          "journal_no, date, branch_id, and total are required"
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(
        res,
        message.journal_entry_item?.arrayRequired ||
          "Items array is required"
      );
    }

    for (const it of items) {
      if (!it.account_id) {
        await t.rollback();
        return commonService.badRequest(
          res,
          message.journal_entry_item?.required ||
            "account_id is required in items"
        );
      }
    }

    /* ================= CHECK DUPLICATE ================= */

    const existing = await models.JournalEntry.findOne({
      where: { journal_no: payload.journal_no },
      paranoid: false, // include soft-deleted
      transaction: t,
    });

    let journalEntry;

    if (existing) {
      if (existing.deleted_at) {
        // 🔁 Restore soft-deleted record
        await existing.restore({ transaction: t });
        await existing.update(payload, { transaction: t });
        journalEntry = existing;
      } else {
        // ❌ Active duplicate
        await t.rollback();
        return commonService.badRequest(
          res,
          "journal_no already exists"
        );
      }
    } else {
      // ✅ Create new journal entry
      journalEntry = await models.JournalEntry.create(payload, {
        transaction: t,
      });
    }

    /* ================= ITEMS ================= */

    // Remove old items (if restored)
    await models.JournalEntryItem.destroy({
      where: { journal_entry_id: journalEntry.id },
      transaction: t,
    });

    const itemsToCreate = items.map((it) => ({
      journal_entry_id: journalEntry.id,
      account_id: it.account_id,
      description: it.description || null,
      debit: it.debit ?? 0,
      credit: it.credit ?? 0,
    }));

    const createdItems = await models.JournalEntryItem.bulkCreate(
      itemsToCreate,
      { returning: true, transaction: t }
    );

    await t.commit();

    return commonService.createdResponse(res, {
      journal_entry: journalEntry,
      items: createdItems,
    });
  } catch (err) {
    await t.rollback();

    // ✅ Clean unique constraint message
    if (err?.name === "SequelizeUniqueConstraintError") {
      return commonService.badRequest(
        res,
        "journal_no already exists"
      );
    }

    return commonService.handleError(res, err);
  }
};

const getAllJournalEntries = async (req, res) => {
  try {
    const { search, branch_id, date_from, date_to } = req.query;

    let query = `
      SELECT
        je.*,
        b.branch_name
      FROM journal_entries je
      LEFT JOIN branches b ON je.branch_id = b.id
      WHERE je.deleted_at IS NULL
    `;
    const replacements = {};

    if (search) {
      query += ` AND (je.journal_no LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    if (branch_id) {
      query += ` AND je.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    if (date_from) {
      query += ` AND je.date >= :date_from`;
      replacements.date_from = date_from;
    }

    if (date_to) {
      query += ` AND je.date <= :date_to`;
      replacements.date_to = date_to;
    }

    query += ` ORDER BY je.date DESC, je.id DESC`;

    const journalEntries = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      replacements,
    });

    // Get items for each journal entry
    const journalEntryIds = journalEntries.map((je) => je.id);
    
    let items = [];
    if (journalEntryIds.length > 0) {
      const itemQuery = `
        SELECT
          jei.*,
          l.ledger_name as account_name
        FROM journal_entry_items jei
        LEFT JOIN ledger l ON jei.account_id = l.id
        WHERE jei.journal_entry_id IN (:journalEntryIds)
          AND jei.deleted_at IS NULL
        ORDER BY jei.id
      `;
      items = await sequelize.query(itemQuery, {
        type: sequelize.QueryTypes.SELECT,
        replacements: { journalEntryIds },
      });
    }

    // Attach items to their respective journal entries
    const result = journalEntries.map((je) => ({
      ...je,
      items: items.filter((it) => it.journal_entry_id === je.id),
    }));

    return commonService.okResponse(res, result);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getJournalEntryById = async (req, res) => {
  try {
    const { id } = req.params;

    const journalEntry = await models.JournalEntry.findByPk(id);

    if (!journalEntry) {
      return commonService.notFound(res, "Journal Entry not found");
    }

    const items = await models.JournalEntryItem.findAll({
      where: { journal_entry_id: id },
    });

    return commonService.okResponse(res, {
      journal_entry: journalEntry,
      items: items,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateJournalEntry = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { items = [], ...payload } = req.body;

    const journalEntry = await models.JournalEntry.findByPk(id, {
      transaction: t,
    });

    if (!journalEntry) {
      await t.rollback();
      return commonService.notFound(res, "Journal Entry not found");
    }

    // Update journal entry header
    await journalEntry.update(payload, { transaction: t });

    // If items are provided, update them
    if (items.length > 0) {
      // Remove old items
      await models.JournalEntryItem.destroy({
        where: { journal_entry_id: id },
        transaction: t,
      });

      // Create new items
      const itemsToCreate = items.map((it) => ({
        journal_entry_id: id,
        account_id: it.account_id,
        description: it.description || null,
        debit: it.debit ?? 0,
        credit: it.credit ?? 0,
      }));

      const createdItems = await models.JournalEntryItem.bulkCreate(
        itemsToCreate,
        { returning: true, transaction: t }
      );

      await t.commit();

      return commonService.okResponse(res, {
        journal_entry: journalEntry,
        items: createdItems,
      });
    }

    await t.commit();

    return commonService.okResponse(res, {
      journal_entry: journalEntry,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const deleteJournalEntry = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const journalEntry = await models.JournalEntry.findByPk(id, {
      transaction: t,
    });

    if (!journalEntry) {
      await t.rollback();
      return commonService.notFound(res, "Journal Entry not found");
    }

    // Soft delete items
    await models.JournalEntryItem.destroy({
      where: { journal_entry_id: id },
      transaction: t,
    });

    // Soft delete journal entry
    await journalEntry.destroy({ transaction: t });

    await t.commit();

    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const deleteJournalEntryItem = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const item = await models.JournalEntryItem.findByPk(id, {
      transaction: t,
    });

    if (!item) {
      await t.rollback();
      return commonService.notFound(res, "Journal Entry Item not found");
    }

    // Soft delete the item
    await item.destroy({ transaction: t });

    await t.commit();

    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Generate next Journal Entry Number
const generateJournalNo = async (req, res) => {
  try {
    // Auto-generate next journal_no in format JE001
    const journal_no = await generateFiscalSeriesCode(
      models.JournalEntry,
      "journal_no",
      "JE",
      { pad: 3 }
    );

    return commonService.okResponse(res, { journal_no });
  } catch (err) {
    console.error("Error generating journal number:", err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createJournalEntry,
  getAllJournalEntries,
  getJournalEntryById,
  updateJournalEntry,
  deleteJournalEntry,
  deleteJournalEntryItem,
  generateJournalNo,
};
