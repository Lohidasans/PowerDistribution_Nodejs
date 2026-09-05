const { dateFilter } = require('./dateHelper');

// Cash is a carried-forward balance; other payment modes are period activity.
const revenueDateFilter = (filters, replacements) => {
    let periodCondition = dateFilter(filters, 'rs.txn_date', replacements);
    // dateFilter does not handle an end date on its own.
    if (!periodCondition && filters.to_date) {
        replacements.to_date = filters.to_date;
        periodCondition = ' AND DATE(rs.txn_date) <= :to_date';
    }

    const balanceCondition = periodCondition && replacements.from_date
        ? ` AND (
            (rs.payment_mode = 'Cash' AND DATE(rs.txn_date) <= :to_date)
            OR (rs.payment_mode IS DISTINCT FROM 'Cash' ${periodCondition})
        )`
        : periodCondition;

    return { periodCondition, balanceCondition };
};

module.exports = { revenueDateFilter };
