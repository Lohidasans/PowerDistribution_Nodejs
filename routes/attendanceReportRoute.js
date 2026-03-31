const express = require('express');
const router = express.Router();
const { getAttendanceReport } = require('../services/attendanceReportService');

/**
 * @openapi
 * /api/v1/attendance/reports:
 *   get:
 *     summary: Get pivoted attendance report from employee_attendance_reports table
 *     tags: [Attendance Reports]
 *     description: |
 *       Returns a date-pivoted attendance report where each employee is a row and
 *       each date in the selected range is a column group showing:
 *       Status (P/A), Clock-In, Clock-Out, Break Hours, Overtime Hours, Production Hours.
 *
 *       Priority of date resolution:
 *         1. `month` param (full calendar month)
 *         2. `from_date` + `to_date` range
 *         3. Current month (default)
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2026-02" }
 *         description: Month in YYYY-MM format. Sets full month range. Takes priority over from_date/to_date.
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date, example: "2026-02-01" }
 *         description: Start date (YYYY-MM-DD). Used when month is not provided.
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date, example: "2026-02-14" }
 *         description: End date (YYYY-MM-DD). Used when month is not provided.
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Filter by branch ID (from employees.branch_id)
 *       - in: query
 *         name: employee_id
 *         schema: { type: integer }
 *         description: Filter to a single employee
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by employee name or employee number (case-insensitive)
 *     responses:
 *       200:
 *         description: Pivoted attendance report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: object
 *                       properties:
 *                         from_date: { type: string, example: "2026-02-01" }
 *                         to_date:   { type: string, example: "2026-02-28" }
 *                         total_days: { type: integer, example: 28 }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_employees: { type: integer }
 *                         total_present_records: { type: integer }
 *                         total_absent_records:  { type: integer }
 *                     date_headers:
 *                       type: array
 *                       description: Ordered list of dates for table column headers
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:      { type: string, example: "2026-02-12" }
 *                           day_short: { type: string, example: "Thu" }
 *                           day_full:  { type: string, example: "Thursday" }
 *                           label:     { type: string, example: "Feb 12, Thu" }
 *                     employees:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           s_no:             { type: integer }
 *                           employee_id:      { type: integer }
 *                           employee_no:      { type: string }
 *                           employee_name:    { type: string }
 *                           branch_name:      { type: string }
 *                           department_name:  { type: string }
 *                           designation_name: { type: string }
 *                           attendance:
 *                             type: object
 *                             description: |
 *                               Keys are date strings 'YYYY-MM-DD'.
 *                               Each value is the day's attendance detail.
 *                             additionalProperties:
 *                               type: object
 *                               properties:
 *                                 status:           { type: string, enum: [Present, Absent] }
 *                                 status_short:     { type: string, enum: [P, A] }
 *                                 clock_in:         { type: string, nullable: true, example: "10:30" }
 *                                 clock_out:        { type: string, nullable: true, example: "20:30" }
 *                                 break_hours:      { type: string, example: "1:00" }
 *                                 production_hours: { type: string, example: "7:30" }
 *                                 overtime_hours:   { type: string, example: "0:00" }
 *                                 total_hours:      { type: string, example: "10:00" }
 *                                 late_by_hours:    { type: string, example: "0:00" }
 *                           summary:
 *                             type: object
 *                             properties:
 *                               present_days:           { type: integer }
 *                               absent_days:            { type: integer }
 *                               total_working_days:     { type: integer }
 *                               total_production_hours: { type: string, example: "210:30" }
 *                               total_overtime_hours:   { type: string, example: "5:00" }
 */
router.get('/attendance/reports', getAttendanceReport);

module.exports = router;
