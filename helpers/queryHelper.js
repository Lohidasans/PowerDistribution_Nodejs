const { Op } = require("sequelize");

/**
 * Builds a Sequelize OR condition for search across multiple fields
 * @param {string} searchKey - the text to search
 * @param {string[]} fields - list of fields to search in
 * @returns {object|null} - Sequelize OR condition or null
 */
const buildSearchCondition = (searchKey, fields = []) => {
    if (!searchKey || fields.length === 0) return null;

    return {
        [Op.or]: fields.map(field => ({
            [field]: { [Op.iLike]: `%${searchKey}%` }
        }))
    };
};

module.exports = { buildSearchCondition };
