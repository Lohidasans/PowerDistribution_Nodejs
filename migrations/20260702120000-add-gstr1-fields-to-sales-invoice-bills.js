"use strict";

/**
 * GSTR-1 classification snapshot on sales_invoice_bills.
 *
 * Adds the invoice-time GST fields required to bucket every invoice into a
 * GSTR-1 section (B2B / B2CL / B2CS / EXP / EXEMP) without re-deriving from the
 * (mutable) customer master every time the report runs. Values are snapshotted
 * at invoice save time; this migration also backfills existing rows from the
 * current customer/branch/state masters as a one-time starting point.
 *
 * Inter-state is inferred from igst_amount > 0 (the billing UI already decides
 * CGST/SGST vs IGST at bill time), and B2CL additionally requires the invoice
 * value to cross the ₹2,50,000 threshold.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "sales_invoice_bills";
    const desc = await queryInterface.describeTable(table);

    const addIfMissing = async (name, spec) => {
      if (!desc[name]) await queryInterface.addColumn(table, name, spec);
    };

    // Invoice-time snapshot of the customer's GSTIN (null/blank => unregistered).
    await addIfMissing("customer_gstin", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Place of supply (state) snapshot — name + code, for display and JSON export.
    await addIfMissing("place_of_supply", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await addIfMissing("place_of_supply_code", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Export flags (EXP tab). Domestic invoices stay false.
    await addIfMissing("is_export", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await addIfMissing("export_type", {
      type: Sequelize.ENUM("With Payment", "Without Payment"),
      allowNull: true,
    });

    // Reverse charge (B2B tab). Normal jewellery retail stays false.
    await addIfMissing("reverse_charge", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Supply nature (EXEMP tab). Regular taxable sales stay 'Taxable'.
    await addIfMissing("supply_type", {
      type: Sequelize.ENUM("Taxable", "Exempt", "Nil Rated", "Non GST"),
      allowNull: false,
      defaultValue: "Taxable",
    });

    // Resolved GSTR-1 bucket, computed at save time from the fields above.
    await addIfMissing("gstr1_category", {
      type: Sequelize.ENUM("B2B", "B2CL", "B2CS", "EXP", "EXEMP"),
      allowNull: true,
    });

    // ── Backfill existing rows ───────────────────────────────────────────────
    // Rows WITH a customer: snapshot GSTIN + place of supply from the customer's
    // state (falling back to the branch state), then classify.
    await queryInterface.sequelize.query(`
      UPDATE sales_invoice_bills s SET
        customer_gstin       = NULLIF(TRIM(COALESCE(c.gst_no, '')), ''),
        place_of_supply      = COALESCE(
          (SELECT st.state_name FROM states st WHERE st.id = c.state_id),
          (SELECT st.state_name FROM states st JOIN branches b ON b.id = s.branch_id WHERE st.id = b.state_id)
        ),
        place_of_supply_code = COALESCE(
          (SELECT st.state_code FROM states st WHERE st.id = c.state_id),
          (SELECT st.state_code FROM states st JOIN branches b ON b.id = s.branch_id WHERE st.id = b.state_id)
        ),
        is_export      = COALESCE(s.is_export, false),
        reverse_charge = COALESCE(s.reverse_charge, false),
        supply_type    = COALESCE(s.supply_type, 'Taxable'),
        gstr1_category = CASE
          WHEN NULLIF(TRIM(COALESCE(c.gst_no, '')), '') IS NOT NULL THEN 'B2B'
          WHEN COALESCE(s.igst_amount, 0) > 0
            AND (COALESCE(s.subtotal_amount,0) + COALESCE(s.cgst_amount,0) + COALESCE(s.sgst_amount,0) + COALESCE(s.igst_amount,0)) >= 250000 THEN 'B2CL'
          ELSE 'B2CS'
        END
      FROM customers c
      WHERE c.id = s.customer_id AND s.deleted_at IS NULL;
    `);

    // Rows WITHOUT a customer (walk-in without a master record): place of supply
    // from the branch, always unregistered => B2CL (large inter-state) or B2CS.
    await queryInterface.sequelize.query(`
      UPDATE sales_invoice_bills s SET
        customer_gstin       = NULL,
        place_of_supply      = (SELECT st.state_name FROM states st JOIN branches b ON b.id = s.branch_id WHERE st.id = b.state_id),
        place_of_supply_code = (SELECT st.state_code FROM states st JOIN branches b ON b.id = s.branch_id WHERE st.id = b.state_id),
        is_export      = COALESCE(s.is_export, false),
        reverse_charge = COALESCE(s.reverse_charge, false),
        supply_type    = COALESCE(s.supply_type, 'Taxable'),
        gstr1_category = CASE
          WHEN COALESCE(s.igst_amount, 0) > 0
            AND (COALESCE(s.subtotal_amount,0) + COALESCE(s.cgst_amount,0) + COALESCE(s.sgst_amount,0) + COALESCE(s.igst_amount,0)) >= 250000 THEN 'B2CL'
          ELSE 'B2CS'
        END
      WHERE s.customer_id IS NULL AND s.deleted_at IS NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    const table = "sales_invoice_bills";
    const desc = await queryInterface.describeTable(table);

    const dropIfExists = async (name) => {
      if (desc[name]) await queryInterface.removeColumn(table, name);
    };

    await dropIfExists("gstr1_category");
    await dropIfExists("supply_type");
    await dropIfExists("reverse_charge");
    await dropIfExists("export_type");
    await dropIfExists("is_export");
    await dropIfExists("place_of_supply_code");
    await dropIfExists("place_of_supply");
    await dropIfExists("customer_gstin");

    // Drop the ENUM types Sequelize created for the enum columns (Postgres).
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "postgres") {
      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS "enum_sales_invoice_bills_gstr1_category";`
      );
      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS "enum_sales_invoice_bills_supply_type";`
      );
      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS "enum_sales_invoice_bills_export_type";`
      );
    }
  },
};
