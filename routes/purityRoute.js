const express = require("express");
const router = express.Router();
const svc = require("../services/purityService");

router.post("/purities", svc.createPurity);
router.get("/purities", svc.getAllPurities);
router.get("/purities/:id", svc.getPurityById);
router.put("/purities/:id", svc.updatePurity);
router.delete("/purities/:id", svc.deletePurity);


module.exports = router;
