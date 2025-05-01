const sequelize = require("../config/database");
const User = require("./user.model");

const db = { sequelize, User };

module.exports = db;
