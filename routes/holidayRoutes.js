const express = require("express");
const router = express.Router();
const svc = require("../services/holidayService");

router.post("/holidays", svc.createHoliday);
router.get("/holidays", svc.getAllHolidays);
router.get("/holidays/range", svc.getHolidaysInRange);
router.get("/holidays/:id", svc.getHolidayById);
router.put("/holidays/:id", svc.updateHoliday);
router.delete("/holidays/:id", svc.deleteHoliday);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Holidays
 *   description: Holiday management
 */

/**
 * @swagger
 * /holidays:
 *   post:
 *     summary: Create a new holiday
 *     tags: [Holidays]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - holiday_date
 *               - holiday_name
 *             properties:
 *               holiday_date:
 *                 type: string
 *                 format: date
 *               holiday_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Holiday created successfully
 *       400:
 *         description: Invalid input
 */

/**
 * @swagger
 * /holidays:
 *   get:
 *     summary: Get all holidays
 *     tags: [Holidays]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter holidays by year
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Filter holidays by month (1-12)
 *     responses:
 *       200:
 *         description: List of holidays
 */

/**
 * @swagger
 * /holidays/range:
 *   get:
 *     summary: Get holidays within a date range
 *     tags: [Holidays]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of holidays in the specified date range
 *       400:
 *         description: Invalid date range
 */


/**
 * @swagger
 * /holidays/{id}:
 *   get:
 *     summary: Get a holiday by ID
 *     tags: [Holidays]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Holiday details
 *       404:
 *         description: Holiday not found
 */


/**
 * @swagger
 * /holidays/{id}:
 *   put:
 *     summary: Update a holiday
 *     tags: [Holidays]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               holiday_date:
 *                 type: string
 *                 format: date
 *               holiday_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Holiday updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Holiday not found
 */


/**
 * @swagger
 * /holidays/{id}:
 *   delete:
 *     summary: Delete a holiday (soft delete)
 *     tags: [Holidays]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Holiday deleted
 *       404:
 *         description: Holiday not found
 */


