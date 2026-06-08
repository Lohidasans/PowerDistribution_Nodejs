const express = require("express");
const router = express.Router();
const svc = require("../services/payrollService");
const autoGenerateMonthlyPayroll = require("../scheduler/autoPayroll.job");
const moment = require("moment");

// ── Manual Payroll Trigger ────────────────────────────────────────────────────
// POST /api/v1/payrolls/auto-generate
// Body: { pay_month: "2026-02" }  (optional — defaults to previous IST month)
router.post("/payrolls/auto-generate", async (req, res) => {
    try {
        const { pay_month } = req.body || {};
        // If a specific month is passed, temporarily override the job
        if (pay_month) {
            if (!/^\d{4}-\d{2}$/.test(pay_month)) {
                return res.status(400).json({ success: false, message: "pay_month must be in YYYY-MM format" });
            }
            // Run the job with overridden month
            const result = await autoGenerateMonthlyPayroll(pay_month);
            return res.json({ success: true, pay_month, result });
        }
        // Run with default (previous IST month)
        const result = await autoGenerateMonthlyPayroll();
        const defaultMonth = moment().utcOffset('+05:30').subtract(1, 'month').format('YYYY-MM');
        return res.json({ success: true, pay_month: defaultMonth, result });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.post("/payrolls", svc.createPayroll);
router.get("/payrolls", svc.getPayrolls);
router.get("/payrolls/attendance-preview", svc.getPayrollAttendancePreview);
router.get("/payrolls/timing", svc.getPayrollTimingDetails);
router.get("/payrolls/:id", svc.getPayrollById);
router.put("/payrolls/:id", svc.updatePayroll);
router.patch("/payrolls/:id/payment", svc.updatePayrollPayment);
router.delete("/payrolls/:id", svc.deletePayroll);

// ── Employee-specific payroll list ───────────────────────────────────────────
// GET /api/v1/employees/:employee_id/payrolls
router.get("/employees/:employee_id/payrolls", svc.getEmployeePayrolls);

// GET /api/v1/employees/:employee_id/payrolls/:payroll_id  (payslip detail)
router.get("/employees/:employee_id/payrolls/:payroll_id", svc.getEmployeePayrollById);

/**
 * @openapi
 * tags:
 *   - name: Payrolls
 *     description: Payroll Management
 */

/**
 * @openapi
 * /api/v1/payrolls/attendance-preview:
 *   get:
 *     summary: Preview worked_days & absent_days from employee_tracking for a pay month
 *     tags: [Payrolls]
 *     parameters:
 *       - in: query
 *         name: employee_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: pay_month
 *         required: true
 *         schema: { type: string, example: "2026-02" }
 *     responses:
 *       200:
 *         description: Attendance summary for the month
 */

/**
 * @openapi
 * /api/v1/payrolls:
 *   post:
 *     summary: Create a payroll record for an employee
 *     tags: [Payrolls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pay_date
 *               - branch_id
 *               - employee_id
 *               - pay_month
 *             properties:
 *               pay_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-02-05"
 *               branch_id:
 *                 type: integer
 *               employee_id:
 *                 type: integer
 *               pay_month:
 *                 type: string
 *                 example: "2026-02"
 *               pf_number:
 *                 type: string
 *               comp_off_days:
 *                 type: integer
 *                 default: 0
 *               loss_of_pay_days:
 *                 type: integer
 *                 default: 0
 *               earnings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     payroll_master_id: { type: integer }
 *                     amount: { type: number }
 *               deductions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     payroll_master_id: { type: integer }
 *                     amount: { type: number }
 *     responses:
 *       201:
 *         description: Payroll created. worked_days and absent_days are auto-calculated from employee_tracking.
 *       400:
 *         description: Validation error
 */

/**
 * @openapi
 * /api/v1/payrolls:
 *   get:
 *     summary: List payrolls with optional filters
 *     tags: [Payrolls]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *       - in: query
 *         name: employee_id
 *         schema: { type: integer }
 *       - in: query
 *         name: pay_month
 *         schema: { type: string, example: "2026-02" }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by employee name or employee_no
 *     responses:
 *       200:
 *         description: Paginated payroll list
 */

/**
 * @openapi
 * /api/v1/payrolls/{id}:
 *   get:
 *     summary: Get a single payroll with earnings & deductions
 *     tags: [Payrolls]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Payroll detail
 *       404:
 *         description: Not found
 */

/**
 * @openapi
 * /api/v1/payrolls/{id}:
 *   put:
 *     summary: Update a payroll record
 *     tags: [Payrolls]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pay_date: { type: string, format: date }
 *               branch_id: { type: integer }
 *               pay_month: { type: string }
 *               pf_number: { type: string }
 *               comp_off_days: { type: integer }
 *               loss_of_pay_days: { type: integer }
 *               earnings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     payroll_master_id: { type: integer }
 *                     amount: { type: number }
 *               deductions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     payroll_master_id: { type: integer }
 *                     amount: { type: number }
 *     responses:
 *       200:
 *         description: Updated successfully
 *       404:
 *         description: Not found
 */

/**
 * @openapi
 * /api/v1/payrolls/{id}:
 *   delete:
 *     summary: Soft-delete a payroll record
 *     tags: [Payrolls]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Not found
 */

module.exports = router;
