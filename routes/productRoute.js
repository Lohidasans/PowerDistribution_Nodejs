var express = require("express");
var router = express.Router();
const svc = require("../services/productService");

// CRUD
router.post("/products", svc.createProduct);
router.get("/products/:id", svc.getProductById);
router.delete("/products/:id", svc.deleteProduct);

module.exports = router;
