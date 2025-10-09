const { Client } = require("pg");
const { Sequelize } = require("sequelize");

const pgClient = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

pgClient
  .connect()
  .then(() => console.log("PostgreSQL Client connected successfully!"))
  .catch((err) => console.error("PostgreSQL Client connection error:", err));

// Sequelize Connection (for ORM)
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "postgres", // Hardcode this to avoid .env issues
    logging: false, // Optional: Disable query logging
  }
);

// Test Sequelize Connection
sequelize
  .authenticate()
  .then(() => console.log("Sequelize connected successfully!"))
  .catch((err) => console.error("Sequelize connection error:", err));

module.exports = { pgClient, sequelize };