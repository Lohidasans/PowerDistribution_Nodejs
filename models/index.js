const Sequelize = require('sequelize');
const { sequelize } = require('../config/dbConfig');

const Permission = require('./permissions')(sequelize, Sequelize.DataTypes);
const Role = require('./roles')(sequelize, Sequelize.DataTypes);
const RolePermission = require('./rolePermissions')(sequelize, Sequelize.DataTypes);

const models = {
  Permission,
  Role,
  RolePermission,
};

Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

(async () => {
  try {
    await sequelize.sync();
    console.log("Models synchronized successfully!.");
  } catch (error) {
    console.error("Unable to sync database:", error);
  }
})();

module.exports = { sequelize, models }; 
