const { models, sequelize } = require("../models/index");
const generateDeliveryChallanNoFunc = async () => {
  const last = await models.DeliveryChellan.findOne({
    attributes: ["delivery_challan_no"],
    order: [["id", "DESC"]],
    paranoid: false,
  });

  // If no record OR invalid / zero value → start from DC001
  if (
    !last ||
    !last.delivery_challan_no ||
    !/^DC\d+$/.test(last.delivery_challan_no)
  ) {
    return "DC001";
  }

  const numericPart = parseInt(
    last.delivery_challan_no.replace(/^DC/, ""),
    10
  );

  // If DB has DC000 or invalid number
  const nextNumber = numericPart >= 1 ? numericPart + 1 : 1;

  return `DC${String(nextNumber).padStart(3, "0")}`;
};

module.exports ={ generateDeliveryChallanNoFunc};