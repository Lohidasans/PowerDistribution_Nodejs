// Utility script to hash existing plain text passwords
const bcrypt = require('bcrypt');
const { models, sequelize } = require('../models');

async function hashExistingPasswords() {
  try {
    console.log('Starting password hashing process...\n');

    // Find all users with non-null passwords
    const users = await models.User.findAll({
      where: {
        password_hash: {
          [require('sequelize').Op.ne]: null
        },
        deleted_at: null
      }
    });

    console.log(`Found ${users.length} users to check\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
      const isAlreadyHashed = /^\$2[aby]\$/.test(user.password_hash);

      if (!isAlreadyHashed) {
        console.log(`Hashing password for user: ${user.email || user.id}`);
        
        // Store the plain text password
        const plainPassword = user.password_hash;
        
        // Hash it
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        // Update the user
        await user.update({
          password_hash: hashedPassword
        });
        
        updatedCount++;
        console.log(`✓ Updated user: ${user.email || user.id}\n`);
      } else {
        console.log(`⊘ User ${user.email || user.id} password is already hashed, skipping\n`);
        skippedCount++;
      }
    }

    console.log('\n=================================');
    console.log('Password hashing completed!');
    console.log(`Total users processed: ${users.length}`);
    console.log(`Passwords updated: ${updatedCount}`);
    console.log(`Already hashed (skipped): ${skippedCount}`);
    console.log('=================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error hashing passwords:', error);
    process.exit(1);
  }
}

// Run the script
hashExistingPasswords();
