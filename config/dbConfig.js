require('dotenv').config();
const { Client } = require("pg");
const { Sequelize } = require("sequelize");

const pgClient = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
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
