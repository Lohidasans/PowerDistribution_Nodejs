require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const { sequelize } = require('./models/index');
const appRouter = require('./routes/index');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
appRouter(app);

sequelize
  .authenticate()
  .then(() => {
    console.log('Database connection established successfully.');
    return sequelize.sync({ alter: false }); // Sync based on the models
  })
  .then(() => {
    console.log('Database synchronized succesfully!.');
  })
  .catch((error) => {
    console.error('Unable to connect to the database:', error);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
