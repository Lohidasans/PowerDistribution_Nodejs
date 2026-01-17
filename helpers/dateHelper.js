const dateFilter = (
    { from_date, to_date, date_filter },
    columnAlias,
    replacements
) => {
    const today = new Date();

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    let autoFromDate = null;
    let autoToDate = todayStr;

    if (date_filter) {
        switch (date_filter) {
            case "today":
                autoFromDate = todayStr;
                break;

            case "week": {
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                autoFromDate = new Date(today.setDate(diff))
                    .toISOString()
                    .split("T")[0];
                break;
            }

            case "month":
                autoFromDate = `${yyyy}-${mm}-01`;
                break;

            case "year":
                autoFromDate = `${yyyy}-01-01`;
                break;
        }
    }

    // THESE MUST BE DECLARED
    const finalFromDate = from_date || autoFromDate;
    const finalToDate = to_date || autoToDate;

    if (finalFromDate && finalToDate) {
        replacements.from_date = finalFromDate;
        replacements.to_date = finalToDate;
        return ` AND ${columnAlias} BETWEEN :from_date AND :to_date`;
    }

    return "";
};

module.exports = { dateFilter };
