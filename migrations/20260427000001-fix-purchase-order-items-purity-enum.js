'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // PostgreSQL cannot cast numeric -> enum directly.
    // Step 1: cast numeric to text
    // Step 2: NULL out any values that don't match the ENUM
    // Step 3: create the enum type (if not exists)
    // Step 4: cast text -> enum
    await queryInterface.sequelize.query(`
      ALTER TABLE "purchase_order_items"
        ALTER COLUMN "purity" TYPE text USING "purity"::text;
    `);

    // Remove trailing zeros so e.g. "92.500" -> "92.5", then NULL anything still not in ENUM
    await queryInterface.sequelize.query(`
      UPDATE "purchase_order_items"
        SET "purity" = RTRIM(RTRIM("purity", '0'), '.')
        WHERE "purity" IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      UPDATE "purchase_order_items"
        SET "purity" = NULL
        WHERE "purity" NOT IN ('80', '92.5', '99.9', '91.75', '100');
    `);

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        CREATE TYPE "public"."enum_purchase_order_items_purity"
          AS ENUM('80', '92.5', '99.9', '91.75', '100');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "purchase_order_items"
        ALTER COLUMN "purity" TYPE "public"."enum_purchase_order_items_purity"
        USING "purity"::"public"."enum_purchase_order_items_purity";
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "purchase_order_items"
        ALTER COLUMN "purity" SET DEFAULT '92.5';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Revert: cast enum -> text -> numeric
    await queryInterface.sequelize.query(`
      ALTER TABLE "purchase_order_items"
        ALTER COLUMN "purity" TYPE text
        USING "purity"::text;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "purchase_order_items"
        ALTER COLUMN "purity" TYPE numeric
        USING "purity"::numeric;
    `);

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "public"."enum_purchase_order_items_purity";
    `);
  },
};
