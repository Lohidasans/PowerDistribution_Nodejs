'use strict';
const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Get all users from the database
    const [users] = await queryInterface.sequelize.query(
      'SELECT id, password_hash FROM users WHERE deleted_at IS NULL'
    );

    console.log(`Found ${users.length} users to update`);

    // Update each user's password
    for (const user of users) {
      // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
      const isAlreadyHashed = /^\$2[aby]\$/.test(user.password_hash);
      
      if (!isAlreadyHashed && user.password_hash) {
        console.log(`Hashing password for user ID: ${user.id}`);
        
        // Hash the plain text password
        const hashedPassword = await bcrypt.hash(user.password_hash, 10);
        
        // Update the user
        await queryInterface.sequelize.query(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          {
            replacements: [hashedPassword, user.id],
            type: Sequelize.QueryTypes.UPDATE
          }
        );
      } else if (isAlreadyHashed) {
        console.log(`User ID ${user.id} password is already hashed, skipping`);
      }
    }

    console.log('Password migration completed successfully!');
  },

  async down(queryInterface, Sequelize) {
    // This migration cannot be reversed as we don't store original passwords
    console.log('Cannot reverse password hashing migration');
  }
};
