# Employee-Specific Attendance History API

## Endpoint

Get attendance history for a specific employee over a date range (like the screenshot showing Albert Flores' attendance).

```
GET /api/v1/employees/:employee_id/attendance/history
```

---

## Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `start_date` | string | ✅ Yes | Start date (YYYY-MM-DD) | `2025-01-01` |
| `end_date` | string | ✅ Yes | End date (YYYY-MM-DD) | `2025-10-05` |
| `status` | string | No | Filter by status | `Present` or `Absent` |
| `search` | string | No | Search by date or day | `2025-10-05` or `Monday` |

---

## Example Requests

### 1. Get Full History for Employee

```bash
GET /api/v1/employees/1/attendance/history?start_date=2025-01-01&end_date=2025-10-05
```

### 2. Filter Only Present Days

```bash
GET /api/v1/employees/1/attendance/history?start_date=2025-01-01&end_date=2025-10-05&status=Present
```

### 3. Filter Only Absent Days

```bash
GET /api/v1/employees/1/attendance/history?start_date=2025-01-01&end_date=2025-10-05&status=Absent
```

### 4. Search by Date

```bash
GET /api/v1/employees/1/attendance/history?start_date=2025-01-01&end_date=2025-10-05&search=2025-10-05
```

---

## Response Format

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "employee": {
      "employee_id": 1,
      "employee_no": "EMP 03/24/25",
      "employee_name": "Albert Flores",
      "branch_name": "Anna Nagar - Chennai",
      "department_name": "Sales",
      "designation_name": "Sales Person"
    },
    "period": {
      "start_date": "2025-01-01",
      "end_date": "2025-10-05",
      "total_days": 102,
      "present_days": 100,
      "absent_days": 2
    },
    "summary": {
      "total_production_hours": "900h 00m",
      "total_overtime_hours": "20h 30m",
      "average_daily_hours": "09h 00m"
    },
    "history": [
      {
        "date": "2025-10-05",
        "day": "Sunday",
        "status": "Present",
        "clock_in": "09:00 AM",
        "clock_out": "07:15 PM",
        "production_hours": "09h 00m",
        "break_hours": "00h 45m",
        "overtime_hours": "00h 20m",
        "total_hours": "09h 20m",
        "late_by": "00h 00m"
      },
      {
        "date": "2025-09-05",
        "day": "Friday",
        "status": "Absent",
        "clock_in": null,
        "clock_out": null,
        "production_hours": "00h 00m",
        "break_hours": "00h 00m",
        "overtime_hours": "00h 00m",
        "total_hours": "00h 00m",
        "late_by": "00h 00m"
      }
    ]
  }
}
```

---

## UI Integration

### Summary Cards

Use the `period` object to populate the cards:

```javascript
// Total Card
totalDays = response.data.period.total_days; // 102

// Present Card  
presentDays = response.data.period.present_days; // 03

// Absent Card
absentDays = response.data.period.absent_days; // 02
```

### Table Data

Use the `history` array to populate the table rows:

```javascript
response.data.history.forEach((record, index) => {
  // S. No: index + 1
  // Date: record.date
  // Status: record.status (Present/Absent)
  // Clock In: record.clock_in
  // Clock Out: record.clock_out
  // Production: record.production_hours
  // Break: record.break_hours
  // Overtime: record.overtime_hours
  // Total Hours: record.total_hours
});
```

### Filters

**Status Filter (Present/Absent buttons):**
```javascript
// When user clicks "Present" button
const url = `/api/v1/employees/${employeeId}/attendance/history?start_date=${startDate}&end_date=${endDate}&status=Present`;

// When user clicks "Absent" button
const url = `/api/v1/employees/${employeeId}/attendance/history?start_date=${startDate}&end_date=${endDate}&status=Absent`;

// When user clears filter
const url = `/api/v1/employees/${employeeId}/attendance/history?start_date=${startDate}&end_date=${endDate}`;
```

**Date Range Filter:**
```javascript
// When user selects date range
const url = `/api/v1/employees/${employeeId}/attendance/history?start_date=${fromDate}&end_date=${toDate}`;
```

**Search Filter:**
```javascript
// When user types in search box
const url = `/api/v1/employees/${employeeId}/attendance/history?start_date=${startDate}&end_date=${endDate}&search=${searchTerm}`;
```

---

## Testing with Sample Data

```bash
# Get history for employee 1 (Bessie Cooper)
curl "http://localhost:5000/api/v1/employees/1/attendance/history?start_date=2026-02-07&end_date=2026-02-09"

# Filter only present days
curl "http://localhost:5000/api/v1/employees/1/attendance/history?start_date=2026-02-07&end_date=2026-02-09&status=Present"

# Filter only absent days
curl "http://localhost:5000/api/v1/employees/1/attendance/history?start_date=2026-02-07&end_date=2026-02-09&status=Absent"

# Search for specific date
curl "http://localhost:5000/api/v1/employees/1/attendance/history?start_date=2026-02-07&end_date=2026-02-09&search=2026-02-09"
```

---

## Notes

- The endpoint generates a row for **every day** in the date range, even if the employee was absent
- Absent days will have `null` for clock_in/clock_out and "00h 00m" for all hour fields
- The `summary` object provides aggregated statistics for the entire period
- History is sorted by date in **descending order** (newest first)
