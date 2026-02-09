# Attendance API Filter Examples

## Available Filters

The `/api/v1/employees/attendance` endpoint now supports comprehensive filtering:

### 1. Status Filter (for Cards)
Filter by attendance status - useful for clicking on the cards in the UI:

**All Employees:**
```
GET /api/v1/employees/attendance?date=2026-02-09
```

**Present Only:**
```
GET /api/v1/employees/attendance?date=2026-02-09&status=Present
```

**Absent Only:**
```
GET /api/v1/employees/attendance?date=2026-02-09&status=Absent
```

**Overtime Only** (employees who worked past 6:00 PM):
```
GET /api/v1/employees/attendance?date=2026-02-09&status=Overtime
```

---

### 2. Dropdown Filters

**Filter by Branch:**
```
GET /api/v1/employees/attendance?date=2026-02-09&branch_id=1
```

**Filter by Department:**
```
GET /api/v1/employees/attendance?date=2026-02-09&department_id=2
```

**Filter by Designation/Role:**
```
GET /api/v1/employees/attendance?date=2026-02-09&role_id=3
```

**Combine Multiple Filters:**
```
GET /api/v1/employees/attendance?date=2026-02-09&branch_id=1&department_id=2&status=Present
```

---

### 3. Date Range Filter

**Single Date:**
```
GET /api/v1/employees/attendance?date=2026-02-09
```

**Date Range:**
```
GET /api/v1/employees/attendance?from_date=2026-02-01&to_date=2026-02-09
```

---

### 4. Search Filter

**Search by Employee Name:**
```
GET /api/v1/employees/attendance?date=2026-02-09&search=Bessie
```

**Search by Employee Number:**
```
GET /api/v1/employees/attendance?date=2026-02-09&search=EMP001
```

---

### 5. Combined Filters Example

Get all present employees in Operations department at Anna Nagar branch for the past week:

```
GET /api/v1/employees/attendance?from_date=2026-02-02&to_date=2026-02-09&branch_id=1&department_id=2&status=Present
```

---

## Response Format

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "from_date": "2026-02-09",
    "to_date": "2026-02-09",
    "office_timings": {
      "start": "09:00 AM",
      "end": "06:00 PM",
      "standard_hours": 9
    },
    "summary": {
      "total_employees": 13,
      "present_count": 11,
      "absent_count": 2,
      "overtime_count": 7,
      "total_production_hours": "95h 45m",
      "total_overtime_hours": "12h 05m",
      "average_work_hours": "09h 05m"
    },
    "attendance": [
      {
        "employee_id": 1,
        "employee_no": "EMP001",
        "employee_name": "Bessie Cooper",
        "branch_name": "Anna Nagar - Chennai",
        "department_name": "Operations",
        "designation_name": "Sales Engineer",
        "status": "Present",
        "clock_in": "09:00 AM",
        "clock_out": "06:00 PM",
        "production_hours": "09h 00m",
        "break_hours": "00h 00m",
        "overtime_hours": "00h 00m",
        "total_hours": "09h 00m",
        "late_by": "00h 00m",
        "has_overtime": false
      }
    ]
  }
}
```

---

## Summary Cards Data

Use the `summary` object to populate the cards:

- **All Employee Card**: `summary.total_employees` (54)
- **Present Card**: `summary.present_count` (52)
- **Absent Card**: `summary.absent_count` (02)
- **Overtime Card**: `summary.overtime_count` (07)

---

## Filter Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `date` | string | Single date (YYYY-MM-DD) | `2026-02-09` |
| `from_date` | string | Start date for range | `2026-02-01` |
| `to_date` | string | End date for range | `2026-02-09` |
| `branch_id` | integer | Filter by branch | `1` |
| `department_id` | integer | Filter by department | `2` |
| `role_id` | integer | Filter by designation/role | `3` |
| `status` | string | Filter by status | `Present`, `Absent`, `Overtime` |
| `search` | string | Search employee name/number | `Bessie` or `EMP001` |

---

## Testing

```bash
# Test status filter (for clicking cards)
curl "http://localhost:5000/api/v1/employees/attendance?date=2026-02-09&status=Overtime"

# Test combined filters
curl "http://localhost:5000/api/v1/employees/attendance?date=2026-02-09&branch_id=1&department_id=2&status=Present"

# Test search
curl "http://localhost:5000/api/v1/employees/attendance?date=2026-02-09&search=Devon"

# Test date range
curl "http://localhost:5000/api/v1/employees/attendance?from_date=2026-02-07&to_date=2026-02-09"
```
