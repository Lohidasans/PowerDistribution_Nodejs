"use strict";

/**
 * Link every purchase-return line to the exact GRN line it returns.
 *
 * Until now a purchase_return_item pointed back at its GRN line only through the
 * `ref_no` STRING ("GRN008/26-27/01"). Products, by contrast, reference a GRN
 * line by its integer id (`products.ref_no_id` = `grnItems.id`). That mismatch
 * makes it awkward to answer "is this GRN line still returnable?" consistently.
 *
 * This migration adds `grn_item_id` (integer FK to grnItems.id) so returns link
 * by id the same way products do, and backfills existing rows by matching the
 * stored ref_no against the parent GRN's items.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "purchase_return_items";
    const desc = await queryInterface.describeTable(table);

    if (!desc.grn_item_id) {
      await queryInterface.addColumn(table, "grn_item_id", {
        type: Sequelize.INTEGER,
        allowNull: true, // nullable: non-GRN (ad-hoc) return lines have no source line
      });
    }

    // Backfill: resolve the GRN line by ref_no within the return's own GRN.
    await queryInterface.sequelize.query(`
      UPDATE purchase_return_items pri
      SET grn_item_id = gi.id
      FROM purchase_returns pr
      JOIN "grnItems" gi
        ON gi.grn_id = pr.grn_id
       AND gi.ref_no = pri.ref_no
       AND gi.deleted_at IS NULL
      WHERE pri.pr_id = pr.id
        AND pri.grn_item_id IS NULL
        AND pri.ref_no IS NOT NULL;
    `);

    // Index for the "already returned" lookups the dropdown / validator run.
    await queryInterface.addIndex(table, ["grn_item_id"], {
      name: "purchase_return_items_grn_item_id_idx",
    });
  },

  async down(queryInterface) {
    const table = "purchase_return_items";
    const desc = await queryInterface.describeTable(table);

    try {
      await queryInterface.removeIndex(
        table,
        "purchase_return_items_grn_item_id_idx"
      );
    } catch (e) {
      /* index may not exist */
    }

    if (desc.grn_item_id) {
      await queryInterface.removeColumn(table, "grn_item_id");
    }
  },
};
