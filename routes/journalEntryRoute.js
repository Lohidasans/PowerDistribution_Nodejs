var express = require("express");
var journalEntryRouter = express.Router();
const journalEntryService = require("../services/journalEntryService");

/* ================= ROUTES ================= */

// Generate journal number
journalEntryRouter.get(
  "/journal-entries/generate-number",
  journalEntryService.generateJournalNo
);

// Create journal entry with items
journalEntryRouter.post(
  "/journal-entries",
  journalEntryService.createJournalEntry
);

// Get all journal entries
journalEntryRouter.get(
  "/journal-entries",
  journalEntryService.getAllJournalEntries
);

// Get journal entry by ID
journalEntryRouter.get(
  "/journal-entries/:id",
  journalEntryService.getJournalEntryById
);

// Update journal entry
journalEntryRouter.put(
  "/journal-entries/:id",
  journalEntryService.updateJournalEntry
);

// Delete journal entry (deletes entry + all items)
journalEntryRouter.delete(
  "/journal-entries/:id",
  journalEntryService.deleteJournalEntry
);

// Delete single journal entry item
journalEntryRouter.delete(
  "/journal-entries/items/:id",
  journalEntryService.deleteJournalEntryItem
);

module.exports = journalEntryRouter;
