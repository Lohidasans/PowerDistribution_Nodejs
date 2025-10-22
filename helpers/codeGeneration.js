const generateAutoCode = async (model, field, prefix) => {
    const lastEntry = await model.findOne({
        order: [["id", "DESC"]],
        attributes: [field],
    });

    let nextNumber = 1;
    if (lastEntry?.[field]) {
        const match = lastEntry[field].match(/(\d+)$/);
        if (match) nextNumber = parseInt(match[1]) + 1;
    }

    return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
};


module.exports = generateAutoCode;