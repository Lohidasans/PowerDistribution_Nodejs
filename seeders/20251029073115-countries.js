'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('countries', [
      { country_name: 'India', short_name: 'IN', currency_symbol: '₹', country_code: '+91', country_image_url: 'https://flagcdn.com/in.svg', created_at: new Date(), updated_at: new Date() },
      { country_name: 'United States', short_name: 'US', currency_symbol: '$', country_code: '+1', country_image_url: 'https://flagcdn.com/us.svg', created_at: new Date(), updated_at: new Date() },
      { country_name: 'United Kingdom', short_name: 'UK', currency_symbol: '£', country_code: '+44', country_image_url: 'https://flagcdn.com/gb.svg', created_at: new Date(), updated_at: new Date() },
    ],
    { ignoreDuplicates: true } // prevents the unique constraint error
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('countries', null, {});
  }
};
