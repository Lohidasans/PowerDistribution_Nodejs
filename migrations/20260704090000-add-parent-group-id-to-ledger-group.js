'use strict';

/**
 * Adds a self-referencing parent_group_id to ledger_group so groups can be
 * NESTED (e.g. Current Assets -> Bank Accounts -> HDFC/IOB), like Tally's
 * Groups & Sub-groups. NULL = top-level group (all existing rows), so this is
 * fully backward-compatible — reports render identically until a sub-group is
 * created. A sub-group inherits its nature (ledger_account_id) from its parent.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ledger_group', 'parent_group_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'ledger_group', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('ledger_group', ['parent_group_id'], {
      name: 'ledger_group_parent_group_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('ledger_group', 'ledger_group_parent_group_id_idx');
    await queryInterface.removeColumn('ledger_group', 'parent_group_id');
  },
};
