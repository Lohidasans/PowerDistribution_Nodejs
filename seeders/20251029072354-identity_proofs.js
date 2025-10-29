'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('identity_proofs', [
      { proof_name: 'Aadhaar Card', created_at: new Date(), updated_at: new Date() },
      { proof_name: 'Passport', created_at: new Date(), updated_at: new Date() },
      { proof_name: 'Driving License', created_at: new Date(), updated_at: new Date() },
      { proof_name: 'Voter ID', created_at: new Date(), updated_at: new Date() },
      { proof_name: 'PAN Card', created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('identity_proofs', null, {});
  }
};
