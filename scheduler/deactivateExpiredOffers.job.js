const { sequelize } = require('../models');

// Flip offers to Inactive once their validity window has ended so the admin
// offer list reflects expiry. (The storefront already ignores expired offers
// via the CURRENT_DATE BETWEEN valid_from AND valid_to filter, so this is purely
// to keep the stored status accurate.)
//
// valid_to is inclusive — an offer is still valid ON its valid_to date and only
// becomes expired the day after, which matches the storefront's date filter.
const deactivateExpiredOffers = async () => {
    try {
        console.log('*****Starting expired offer deactivation job******');

        const result = await sequelize.query(
            `UPDATE offers
             SET status = 'Inactive', updated_at = NOW()
             WHERE deleted_at IS NULL
               AND status = 'Active'
               AND valid_to < CURRENT_DATE`
        );

        const rowCount = result?.[1]?.rowCount ?? 0;
        console.log(`✅ Deactivated ${rowCount} expired offer(s)`);
    } catch (error) {
        console.error('❌ Expired offer deactivation failed:', error);
    }
};

module.exports = deactivateExpiredOffers;
