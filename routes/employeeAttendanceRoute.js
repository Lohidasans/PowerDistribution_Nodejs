var express = require("express");
var router = express.Router();
const attendanceSvc = require("../services/employeeAttendanceService");

// Get employee attendance for a specific date
router.get("/employees/attendance", attendanceSvc.getEmployeeAttendance);

// Get attendance history for a specific employee
router.get("/employees/:employee_id/attendance/history", attendanceSvc.getEmployeeAttendanceHistory);

// Get attendance summary/dashboard
router.get("/employees/attendance/summary", attendanceSvc.getAttendanceSummary);

module.exports = router;

/**
 * @openapi
 * /api/v1/employees/attendance:
 *   get:
 *     summary: Get employee attendance with work hours calculation
 *     tags: [Employee Attendance]
 *     description: |
 *       Calculate employee attendance based on office timings (09:00 AM - 06:00 PM).
 *       Returns clock in/out times, production hours, break hours, overtime, and total hours.
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Single date in YYYY-MM-DD format (defaults to today). Use this OR from_date/to_date
 *         example: "2024-02-09"
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date }
 *         description: Start date for date range filter (YYYY-MM-DD)
 *         example: "2024-02-01"
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date }
 *         description: End date for date range filter (YYYY-MM-DD)
 *         example: "2024-02-09"
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Filter by branch ID
 *       - in: query
 *         name: department_id
 *         schema: { type: integer }
 *         description: Filter by department ID
 *       - in: query
 *         name: role_id
 *         schema: { type: integer }
 *         description: Filter by role/designation ID
 *       - in: query
 *         name: employee_id
 *         schema: { type: integer }
 *         description: Filter by specific employee ID
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Present, Absent, Overtime] }
 *         description: Filter by attendance status (Present/Absent) or employees with Overtime
 *         example: "Present"
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by employee name or employee number
 *         example: "John"
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     from_date: { type: string, format: date }
 *                     to_date: { type: string, format: date }
 *                     office_timings:
 *                       type: object
 *                       properties:
 *                         start: { type: string, example: "09:00 AM" }
 *                         end: { type: string, example: "06:00 PM" }
 *                         standard_hours: { type: integer, example: 9 }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_employees: { type: integer }
 *                         present_count: { type: integer }
 *                         absent_count: { type: integer }
 *                         overtime_count: { type: integer, description: "Number of employees who worked overtime" }
 *                         total_production_hours: { type: string, example: "72h 30m" }
 *                         total_overtime_hours: { type: string, example: "05h 15m" }
 *                         average_work_hours: { type: string, example: "08h 45m" }
 *                     attendance:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           employee_id: { type: integer }
 *                           employee_no: { type: string }
 *                           employee_name: { type: string }
 *                           branch_name: { type: string }
 *                           department_name: { type: string }
 *                           designation_name: { type: string }
 *                           status: { type: string, enum: [Present, Absent] }
 *                           clock_in: { type: string, example: "09:00 AM" }
 *                           clock_out: { type: string, example: "06:00 PM" }
 *                           production_hours: { type: string, example: "10h 00m" }
 *                           break_hours: { type: string, example: "00h 45m" }
 *                           overtime_hours: { type: string, example: "02h 15m" }
 *                           total_hours: { type: string, example: "10h 00m" }
 *                           late_by: { type: string, example: "00h 15m" }
 */

/**
 * @openapi
 * /api/v1/employees/{employee_id}/attendance/history:
 *   get:
 *     summary: Get attendance history for a specific employee
 *     tags: [Employee Attendance]
 *     description: Returns attendance records for an employee over a date range with daily breakdown
 *     parameters:
 *       - in: path
 *         name: employee_id
 *         required: true
 *         schema: { type: integer }
 *         description: Employee ID
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: Start date in YYYY-MM-DD format
 *         example: "2024-02-01"
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: End date in YYYY-MM-DD format
 *         example: "2024-02-09"
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     employee:
 *                       type: object
 *                       properties:
 *                         employee_id: { type: integer }
 *                         employee_no: { type: string }
 *                         employee_name: { type: string }
 *                         branch_name: { type: string }
 *                         department_name: { type: string }
 *                         designation_name: { type: string }
 *                     period:
 *                       type: object
 *                       properties:
 *                         start_date: { type: string, format: date }
 *                         end_date: { type: string, format: date }
 *                         total_days: { type: integer }
 *                         present_days: { type: integer }
 *                         absent_days: { type: integer }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_production_hours: { type: string }
 *                         total_overtime_hours: { type: string }
 *                         average_daily_hours: { type: string }
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date: { type: string, format: date }
 *                           day: { type: string, example: "Monday" }
 *                           status: { type: string, enum: [Present, Absent] }
 *                           clock_in: { type: string }
 *                           clock_out: { type: string }
 *                           production_hours: { type: string }
 *                           break_hours: { type: string }
 *                           overtime_hours: { type: string }
 *                           total_hours: { type: string }
 *                           late_by: { type: string }
 */

/**
 * @openapi
 * /api/v1/employees/attendance/summary:
 *   get:
 *     summary: Get attendance summary/dashboard
 *     tags: [Employee Attendance]
 *     description: Returns high-level attendance statistics for a specific date
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Date in YYYY-MM-DD format (defaults to today)
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *         description: Filter by branch ID
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     date: { type: string, format: date }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_employees: { type: integer }
 *                         present_count: { type: integer }
 *                         absent_count: { type: integer }
 *                         late_arrivals: { type: integer }
 *                         attendance_percentage: { type: number, format: float }
 */
