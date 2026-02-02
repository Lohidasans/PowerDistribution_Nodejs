# PowerDistribution Node.js - Complete Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Architecture](#project-architecture)
4. [Database Schema](#database-schema)
5. [Application Flow](#application-flow)
6. [Module Structure](#module-structure)
7. [API Documentation](#api-documentation)
8. [Setup and Installation](#setup-and-installation)
9. [Recent Additions](#recent-additions)

---

## 1. Project Overview

PowerDistribution is a comprehensive enterprise management system built with Node.js that handles various business operations including:

- **Employee Management** - Employee records, departments, tracking, and biometric integration
- **Inventory Management** - Products, categories, stock transfers, GRN
- **Sales Management** - Orders, invoices, returns, quotations
- **Customer Management** - Customer records, enrollments, schemes
- **Vendor Management** - Vendor details, purchase orders, payments
- **Financial Management** - Ledgers, journal entries, vouchers
- **Asset Management** - Asset tracking, maintenance history
- **HR Management** - Leave, holidays, payroll, incentives
- **Device Management** - Biometric devices, tracking systems

---

## 2. Technology Stack

### Backend Framework
- **Node.js** - Runtime environment
- **Express.js** - Web application framework

### Database
- **PostgreSQL** - Primary database
- **Sequelize ORM** - Object-relational mapping

### Key Dependencies
```json
{
  "express": "^4.21.2",
  "sequelize": "^6.37.5",
  "pg": "^8.13.3",
  "bcrypt": "^6.0.0",
  "jsonwebtoken": "^9.0.3",
  "swagger-jsdoc": "^6.2.8",
  "swagger-ui-express": "^5.0.1",
  "multer": "^2.0.2",
  "node-cron": "^4.2.1",
  "dotenv": "^16.6.1",
  "cors": "^2.8.5"
}
```

---

## 3. Project Architecture

### Directory Structure

```
PowerDistribution_Nodejs/
│
├── app.js                      # Application entry point
├── package.json                # Dependencies and scripts
├── .env                        # Environment variables
│
├── config/                     # Configuration files
│   ├── config.json            # Sequelize configuration
│   ├── database.js            # Database connection
│   ├── dbConfig.js            # Sequelize instance
│   └── swagger.js             # Swagger API documentation config
│
├── models/                     # Sequelize models (Database tables)
│   ├── index.js               # Model relationships and exports
│   ├── employees.js           # Employee model
│   ├── employeeTracking.js    # Employee tracking model
│   ├── deviceInfos.js         # Device information model
│   ├── branches.js            # Branch model
│   ├── customers.js           # Customer model
│   └── ... (50+ models)
│
├── routes/                     # API route definitions
│   ├── index.js               # Central route aggregator
│   ├── employeeRoute.js       # Employee endpoints
│   ├── deviceInfoRoute.js     # Device info endpoints
│   └── ... (40+ route files)
│
├── services/                   # Business logic layer
│   ├── employeeService.js     # Employee business logic
│   ├── deviceInfoService.js   # Device info business logic
│   └── ... (40+ service files)
│
├── validators/                 # Input validation
│   └── ... (validation schemas)
│
├── helpers/                    # Utility functions
│   ├── billingCalculations.js
│   ├── dateHelper.js
│   ├── queryHelper.js
│   └── codeGeneration.js
│
├── constants/                  # Constants and enums
│   ├── en.json                # Message constants
│   └── enum.js                # Enumeration values
│
├── migrations/                 # Database migrations
│   └── ... (migration files)
│
├── seeders/                    # Database seeders
│   └── ... (seed data)
│
├── scheduler/                  # Cron jobs
│   └── scheduler.js
│
├── utils/                      # Utility modules
│
└── postman/                    # API collections
    ├── Device_Info_API.postman_collection.json
    ├── Asset_Management_API.postman_collection.json
    └── ... (other collections)
```

---

## 4. Database Schema

### Key Database Tables

#### Core Tables

**1. Employees**
```sql
- id (PK, AUTO INCREMENT)
- profile_image_url (VARCHAR)
- employee_no (VARCHAR, UNIQUE)
- employee_name (VARCHAR)
- department_id (INTEGER, FK)
- role_id (INTEGER, FK)
- joining_date (DATE)
- employment_type (ENUM: Full-Time, Part-Time, Contract)
- gender (ENUM: Male, Female, Other)
- date_of_birth (DATE)
- branch_id (INTEGER, FK)
- status (ENUM: Active, Inactive)
- ref_employee_id (INTEGER, NULLABLE) -- NEW
- device_id (VARCHAR, NULLABLE) -- NEW
- enroll_type (VARCHAR, NULLABLE) -- NEW
- is_enrolled (BOOLEAN, DEFAULT false) -- NEW
- card (INTEGER, NULLABLE) -- NEW
- created_at, updated_at, deleted_at
```

**2. Employee Tracking** (NEW)
```sql
- id (PK, AUTO INCREMENT)
- ref_employee_id (INTEGER)
- status_id (INTEGER)
- date (DATE)
- time (TIME)
- device_id (VARCHAR)
- seq_number (INTEGER)
- created_at, updated_at, deleted_at
```

**3. Device Infos** (NEW)
```sql
- id (PK, AUTO INCREMENT)
- device_name (VARCHAR)
- mac_address (VARCHAR)
- devices (VARCHAR)
- ip_address (VARCHAR)
- branch_id (INTEGER, FK)
- created_at, updated_at, deleted_at
```

**4. Branches**
```sql
- id (PK)
- branch_name (VARCHAR)
- branch_code (VARCHAR, UNIQUE)
- address (TEXT)
- status (ENUM)
- created_at, updated_at, deleted_at
```

**5. Customers**
```sql
- id (PK)
- customer_no (VARCHAR, UNIQUE)
- customer_name (VARCHAR)
- email (VARCHAR)
- phone (VARCHAR)
- branch_id (INTEGER, FK)
- created_at, updated_at, deleted_at
```

### Model Relationships

```javascript
// In models/index.js

// Employee -> Branch
Employee.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });

// Employee -> Department
Employee.belongsTo(EmployeeDepartment, { foreignKey: 'department_id', as: 'department' });

// Employee -> Role
Employee.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

// DeviceInfo -> Branch
DeviceInfo.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });

// EmployeeTracking -> Employee
EmployeeTracking.belongsTo(Employee, { foreignKey: 'ref_employee_id', as: 'employee' });
```

---

## 5. Application Flow

### Request-Response Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP Request (POST /api/v1/device-info)
       ▼
┌─────────────────────────────────────────┐
│          app.js (Entry Point)           │
│  - CORS middleware                      │
│  - Body parser                          │
│  - Cookie parser                        │
│  - Route registration                   │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│      routes/index.js (Router)           │
│  - Route aggregation                    │
│  - Mounts all sub-routes                │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│   routes/deviceInfoRoute.js             │
│  - Defines endpoints                    │
│  - Maps to service functions            │
│  - Swagger documentation                │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│   services/deviceInfoService.js         │
│  - Business logic                       │
│  - Validation                           │
│  - Database transactions                │
│  - Error handling                       │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│   models/deviceInfos.js                 │
│  - Sequelize model definition           │
│  - Table schema                         │
│  - Constraints                          │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│       PostgreSQL Database               │
│  - Data persistence                     │
│  - ACID compliance                      │
└──────────────────┬──────────────────────┘
                   │
                   ▼ Response flows back up
┌─────────────┐
│   Client    │
└─────────────┘
```

### Authentication Flow

```
1. User Login → authRoute.js
2. authService validates credentials
3. JWT token generated
4. Token sent to client
5. Subsequent requests include token in headers
6. Middleware validates token
7. Request proceeds to route handlers
```

---

## 6. Module Structure

### Standard Module Pattern

Each feature follows this consistent structure:

#### 1. Model (`models/[feature].js`)
```javascript
module.exports = (sequelize, DataTypes) => {
    const ModelName = sequelize.define(
        "table_name",
        {
            // Column definitions
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            // ... other fields
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true, // Soft deletes
            deletedAt: "deleted_at",
        }
    );
    return ModelName;
};
```

#### 2. Service (`services/[feature]Service.js`)
```javascript
const { models, sequelize } = require("../models/index");
const { Op } = require("sequelize");

// CREATE operation
const createRecord = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    // Validation
    // Business logic
    // Database operations
    await t.commit();
    return res.status(201).json({ statusCode: 201, data, message });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ statusCode: 500, message: error.message });
  }
};

// READ operations (list, getById)
// UPDATE operation
// DELETE operation (soft delete)
// DROPDOWN/utility operations

module.exports = { createRecord, ... };
```

#### 3. Route (`routes/[feature]Route.js`)
```javascript
var express = require("express");
var router = express.Router();
const service = require("../services/[feature]Service");

// Define endpoints
router.post("/endpoint", service.createRecord);
router.get("/endpoint", service.listRecords);
router.get("/endpoint/:id", service.getById);
router.put("/endpoint/:id", service.updateRecord);
router.delete("/endpoint/:id", service.deleteRecord);

// Swagger documentation (OpenAPI)
/**
 * @openapi
 * /api/v1/endpoint:
 *   post:
 *     summary: Create record
 *     tags: [Feature]
 *     ...
 */

module.exports = router;
```

#### 4. Registration (`routes/index.js`)
```javascript
const FeatureRoute = require("./[feature]Route");

module.exports = (app) => {
  app.use("/api/v1", FeatureRoute);
  // ... other routes
};
```

---

## 7. API Documentation

### Base URL
```
http://localhost:5000/api/v1
```

### Swagger Documentation
```
http://localhost:5000/api-docs
```

### Common Response Format

**Success Response:**
```json
{
  "statusCode": 200,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Error description"
}
```

### Standard HTTP Status Codes
- `200` - OK (Success)
- `201` - Created
- `400` - Bad Request (Validation errors)
- `404` - Not Found
- `500` - Internal Server Error

### Device Info API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/device-info` | Create new device |
| GET | `/device-info` | List all devices (paginated) |
| GET | `/device-info/dropdown` | Dropdown list |
| GET | `/device-info/:id` | Get device by ID |
| PUT | `/device-info/:id` | Update device |
| DELETE | `/device-info/:id` | Delete device (soft) |

### Common Query Parameters

**Pagination:**
- `page` - Page number (default: 1)
- `limit` - Records per page (default: 10)

**Search:**
- `search` - Search term for text fields

**Filters:**
- `branch_id` - Filter by branch
- `status` - Filter by status
- `date_from`, `date_to` - Date range filters

---

## 8. Setup and Installation

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation Steps

**1. Clone the repository**
```bash
git clone <repository-url>
cd PowerDistribution_Nodejs
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment variables**

Create `.env` file in project root:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=power_distribution
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# AWS S3 (if using file uploads)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your_bucket_name
```

**4. Run database migrations**
```bash
npm run migrate
```

**5. Start the application**
```bash
# Development
npm start

# Development with migrations
npm run dev
```

**6. Access the application**
- API: `http://localhost:5000/api/v1`
- Swagger Docs: `http://localhost:5000/api-docs`

### Database Setup

**Create PostgreSQL database:**
```sql
CREATE DATABASE power_distribution;
```

**Sequelize will automatically:**
- Sync models to database
- Create tables with relationships
- Apply constraints and indexes

---

## 9. Recent Additions

### Employee Biometric Integration (Feb 2026)

**New Features Added:**

#### 1. Enhanced Employee Model
Added biometric device integration fields:
- `ref_employee_id` - Reference to external employee system
- `device_id` - Device identifier for enrollment
- `enroll_type` - Type of biometric enrollment
- `is_enrolled` - Enrollment status flag
- `card` - Card/badge number

#### 2. Employee Tracking System
New `employee_tracking` table for attendance/access tracking:
- Tracks employee entry/exit via biometric devices
- Records timestamp, device, and status
- Sequential tracking with `seq_number`

**Use Cases:**
- Employee attendance tracking
- Access control logging
- Time and attendance integration
- Biometric device synchronization

#### 3. Device Information Management
New comprehensive device management system:

**Model:** `deviceInfos`
- Device name and identification
- Network configuration (IP, MAC address)
- Branch assignment
- Device type classification

**Service:** `deviceInfoService.js`
- Full CRUD operations
- Branch-based filtering
- Dropdown support for forms
- Search across multiple fields

**API Endpoints:**
- `POST /device-info` - Register new device
- `GET /device-info` - List all devices
- `GET /device-info/:id` - Device details
- `PUT /device-info/:id` - Update device
- `DELETE /device-info/:id` - Remove device
- `GET /device-info/dropdown` - Quick select list

**Postman Collection:**
- Complete API testing suite
- Sample requests with data
- Environment variable support

### Integration Flow

```
┌──────────────────┐
│ Biometric Device │ (Physical hardware at branch)
└────────┬─────────┘
         │ Network connection (IP)
         ▼
┌──────────────────────────────┐
│   Device Info Registration   │
│   - deviceInfos table        │
│   - MAC, IP, Branch mapping  │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│   Employee Enrollment        │
│   - employees.is_enrolled    │
│   - employees.device_id      │
│   - employees.enroll_type    │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│   Tracking Events            │
│   - employee_tracking table  │
│   - Real-time punch in/out   │
│   - Status tracking          │
└──────────────────────────────┘
```

---

## 10. Best Practices

### Code Standards

**1. Naming Conventions:**
- Models: PascalCase (Employee, DeviceInfo)
- Tables: snake_case (employees, device_infos)
- Files: camelCase (employeeService.js)
- Routes: kebab-case (/device-info)

**2. Error Handling:**
- Always use try-catch blocks
- Rollback transactions on errors
- Return meaningful error messages
- Log errors for debugging

**3. Database Transactions:**
```javascript
const t = await sequelize.transaction();
try {
  // Database operations
  await t.commit();
} catch (error) {
  await t.rollback();
  throw error;
}
```

**4. Validation:**
- Validate required fields
- Check foreign key existence
- Sanitize user inputs
- Use Sequelize validators

**5. Soft Deletes:**
- Use `paranoid: true` for all models
- Never hard delete records
- Maintain data history

### Security Considerations

1. **Authentication:**
   - JWT token-based authentication
   - Password hashing with bcrypt
   - Token expiration

2. **Input Validation:**
   - Validate all user inputs
   - Sanitize data
   - Use parameterized queries (Sequelize ORM)

3. **Environment Variables:**
   - Never commit `.env` file
   - Use environment-specific configurations
   - Rotate secrets regularly

---

## 11. Troubleshooting

### Common Issues

**1. Database Connection Failed**
```
Error: Unable to connect to the database
Solution: Check .env file, verify PostgreSQL is running
```

**2. Port Already in Use**
```
Error: Port 5000 already in use
Solution: Kill the process or change PORT in .env
```

**3. Migration Errors**
```
Error: Migration failed
Solution: Check database permissions, verify model definitions
```

**4. Module Not Found**
```
Error: Cannot find module
Solution: Run npm install, check file paths
```

---

## 12. Future Enhancements

### Planned Features
- Real-time biometric device synchronization
- Advanced reporting and analytics
- Mobile app integration
- Multi-language support
- Role-based access control (RBAC) enhancement
- Audit logging system
- Email/SMS notifications
- Data export functionality
- Dashboard with charts
- Advanced search filters

---

## 13. Support and Maintenance

### Development Team Contact
- For issues: Check logs in console
- For API testing: Use Postman collections
- For database issues: Check PostgreSQL logs

### Version Control
- Use Git for version control
- Follow semantic versioning
- Document all changes
- Create feature branches

---

## Conclusion

This PowerDistribution system is a comprehensive enterprise solution with modular architecture, following industry best practices for scalability, maintainability, and security. The recent biometric integration enhances the employee management capabilities with real-time tracking and device management.

For detailed API documentation, refer to Swagger UI at `/api-docs` endpoint.

---

**Document Version:** 1.0  
**Last Updated:** February 1, 2026  
**Maintained By:** Development Team
