require('dotenv').config();
const { Client } = require("pg");
const { Sequelize } = require("sequelize");

const pgClient = new Client({
  host: "46.202.160.46",
  user: "etsuser",
  port: "5432",
  password: "Ets@1234",
  database: "retailERPDemo2026",
});

// Connect to the database
pgClient.connect()
  .then(() => {
    console.log("[dbConfig] PostgreSQL client connected successfully");
  })
  .catch((err) => {
    console.error("[dbConfig] ERROR: Failed to connect to PostgreSQL:", err);
    console.error("[dbConfig] Error details:", err.message);
  });

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: process.env.DB_DIALECT,
});

module.exports = {
  pgClient,
  sequelize,
};
