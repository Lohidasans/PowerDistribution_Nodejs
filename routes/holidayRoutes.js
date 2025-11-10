const express = require("express");
const router = express.Router();
const svc = require("../services/holidayService");

// Create a new holiday
router.post("/holidays", svc.createHoliday);
router.get("/holidays" , svc.getAllHolidays);
router.get("/holidays/range", svc.getHolidaysInRange);
router.get("/holidays/:id", svc.getHolidayById);
router.put("/holidays/:id", svc.updateHoliday);
router.delete("/holidays/:id", svc.deleteHoliday);

module.exports = router;
