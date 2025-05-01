const express = require("express");
const db = require("./models");
const userRoutes = require("./routes/user.routes");

const app = express();
app.use(express.json());

app.use("/api/users", userRoutes);

// Sync DB and start server
const PORT = process.env.PORT || 3000;
db.sequelize.sync().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
