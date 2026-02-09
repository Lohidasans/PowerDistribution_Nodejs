# Employee Attendance API - Test Guide

## Setup Test Data

### 1. Run the Seeder

```bash
npx sequelize-cli db:seed --seed 20260209000001-employee_tracking_sample.js
```

This will insert sample employee tracking data for testing.

## Test Scenarios

### Scenario 1: Daily Attendance (All Employees)

**Endpoint:** `GET /api/v1/employees/attendance`

**Query Parameters:**
- `date`: 2026-02-09

**Expected Results:**
- 10 total employees
- 8 present, 2 absent
- 1 late arrival (Devon Lane - 15 minutes late)
- 1 overtime (Devon Lane - 1 hour 15 minutes)

**cURL:**
```bash
curl -X GET "http://localhost:5000/api/v1/employees/attendance?date=2026-02-09"
```

**Expected Response Structure:**
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "date": "2026-02-09",
    "office_timings": {
      "start": "09:00 AM",
      "end": "06:00 PM",
      "standard_hours": 9
    },
    "summary": {
      "total_employees": 10,
      "present_count": 8,
      "absent_count": 2,
      "total_production_hours": "72h 00m",
      "total_overtime_hours": "01h 15m",
      "average_work_hours": "09h 00m"
    },
    "attendance": [
      {
        "employee_name": "Bessie Cooper",
        "status": "Present",
        "clock_in": "09:00 AM",
        "clock_out": "06:00 PM",
        "production_hours": "09h 00m",
        "break_hours": "00h 00m",
        "overtime_hours": "00h 00m",
        "total_hours": "09h 00m",
        "late_by": "00h 00m"
      },
      {
        "employee_name": "Devon Lane",
        "status": "Present",
        "clock_in": "09:15 AM",
        "clock_out": "07:15 PM",
        "production_hours": "08h 45m",
        "break_hours": "00h 00m",
        "overtime_hours": "01h 15m",
        "total_hours": "10h 00m",
        "late_by": "00h 15m"
      }
    ]
  }
}
```

---

### Scenario 2: Filter by Branch

**Endpoint:** `GET /api/v1/employees/attendance`

**Query Parameters:**
- `date`: 2026-02-09
- `branch_id`: 1

**cURL:**
```bash
curl -X GET "http://localhost:5000/api/v1/employees/attendance?date=2026-02-09&branch_id=1"
```

---

### Scenario 3: Employee Attendance History

**Endpoint:** `GET /api/v1/employees/:employee_id/attendance/history`

**Path Parameters:**
- `employee_id`: (Use the actual employee ID from your database)

**Query Parameters:**
- `start_date`: 2026-02-05
- `end_date`: 2026-02-09

**cURL:**
```bash
# Replace {employee_id} with actual ID
curl -X GET "http://localhost:5000/api/v1/employees/{employee_id}/attendance/history?start_date=2026-02-05&end_date=2026-02-09"
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "employee": {
      "employee_id": 1,
      "employee_no": "EMP001",
      "employee_name": "Bessie Cooper",
      "branch_name": "Anna Nagar - Chennai",
      "department_name": "Operations",
      "designation_name": "Sales Engineer"
    },
    "period": {
      "start_date": "2026-02-05",
      "end_date": "2026-02-09",
      "total_days": 5,
      "present_days": 4,
      "absent_days": 1
    },
    "summary": {
      "total_production_hours": "35h 50m",
      "total_overtime_hours": "01h 30m",
      "average_daily_hours": "08h 57m"
    },
    "history": [
      {
        "date": "2026-02-09",
        "day": "Sunday",
        "status": "Present",
        "clock_in": "09:00 AM",
        "clock_out": "06:00 PM",
        "production_hours": "09h 00m",
        "break_hours": "00h 00m",
        "overtime_hours": "00h 00m",
        "total_hours": "09h 00m",
        "late_by": "00h 00m"
      }
    ]
  }
}
```

---

### Scenario 4: Attendance Summary Dashboard

**Endpoint:** `GET /api/v1/employees/attendance/summary`

**Query Parameters:**
- `date`: 2026-02-09

**cURL:**
```bash
curl -X GET "http://localhost:5000/api/v1/employees/attendance/summary?date=2026-02-09"
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "date": "2026-02-09",
    "summary": {
      "total_employees": 10,
      "present_count": 8,
      "absent_count": 2,
      "late_arrivals": 1,
      "attendance_percentage": 80.00
    }
  }
}
```

---

## Sample Employee Data

The seeder creates tracking data for these employees (ref_employee_id):

1. **1200** - Bessie Cooper - On time, left on time
2. **1201** - Devon Lane - Late 15 min, overtime 1h 15m
3. **1202** - Albert Flores - On time, left on time
4. **1203** - Eleanor Pena - **Absent**
5. **1204** - Leslie Alexander - On time, left on time
6. **1205** - Jenny Wilson - On time, left on time
7. **1206** - Cody Fisher - On time, left on time
8. **1207** - Darlene Robertson - **Absent**
9. **1208** - Jerome Bell - On time, left on time
10. **1209** - Floyd Miles - On time, left on time

---

## Cleanup Test Data

To remove the test data:

```bash
npx sequelize-cli db:seed:undo --seed 20260209000001-employee_tracking_sample.js
```

---

## Postman Collection

You can also import these endpoints into Postman:

1. Create a new collection: "Employee Attendance API"
2. Add the three endpoints above
3. Set base URL: `http://localhost:5000/api/v1`
4. Test each scenario

---

## Notes

- Make sure your employees table has records with `ref_employee_id` values 1200-1209
- The API uses `status_id = 1` for Clock In and `status_id = 2` for Clock Out
- Office hours are hardcoded as 09:00 AM - 06:00 PM (configurable in the service)
- All times are formatted in 12-hour format (e.g., "09:00 AM")
- Hours are formatted as "XXh XXm" (e.g., "09h 15m")
