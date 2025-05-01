const { User } = require("../models");

exports.getAll = async (req, res) => {
  const users = await User.findAll();
  res.json(users);
};

exports.create = async (req, res) => {
  const user = await User.create(req.body);
  res.status(201).json(user);
};
