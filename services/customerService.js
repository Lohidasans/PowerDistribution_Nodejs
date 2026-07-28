const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require("sequelize");

// Every customer must own exactly ONE ledger under 'Sundry Debtors'. The
// financial reports post the customer leg of a sales invoice / sales return /
// old gold voucher to it and reach it by INNER JOIN through
// customers.ledger_id — so a customer without a ledger silently drops those
// vouchers out of the trial balance, P&L and balance sheet entirely.
//
// Idempotent: returns the existing ledger id if the customer already has a live
// one, so it is safe to call on EVERY create / login / update. Online customers
// register with only a mobile number, so the ledger falls back to being named
// after the mobile until the profile is completed — syncCustomerLedgerName then
// renames it.
const ensureCustomerLedger = async (customer, transaction) => {
  if (customer.ledger_id) {
    // findByPk skips soft-deleted rows, so a customer pointing at a deleted
    // ledger gets a fresh one instead of staying unpostable.
    const existing = await models.Ledger.findByPk(customer.ledger_id, { transaction });
    if (existing) return existing.id;
  }

  // Resolve the "Sundry Debtors" group by name so we never depend on a
  // hardcoded, per-environment ledger_group_id.
  const sundryDebtors = await models.LedgerGroup.findOne({
    where: { ledger_group_name: "Sundry Debtors" },
    attributes: ["id"],
    order: [["id", "ASC"]],
    transaction,
  });

  if (!sundryDebtors) {
    throw new Error(
      "Ledger group 'Sundry Debtors' not found. Seed the chart of accounts first."
    );
  }

  // generateFiscalSeriesCode reads MAX(ledger_no) OUTSIDE the caller's
  // transaction, so two registrations racing each other are handed the SAME
  // number and one trips the unique constraint. The OTP flow makes this
  // reachable: unlike counter staff creating customers one at a time, customers
  // self-register concurrently.
  //
  // Each retry both re-reads MAX (picking up a rival that has since committed)
  // and adds `attempt` — the re-read alone is not enough, because a colliding
  // row that is still uncommitted stays invisible and would be regenerated
  // forever.
  let ledger;
  for (let attempt = 0; ; attempt++) {
    const code = await generateFiscalSeriesCode(models.Ledger, "ledger_no", "LAID", { pad: 3 });
    const next = (parseInt(code.replace(/^LAID/i, ""), 10) || 1) + attempt;
    const ledger_no = `LAID${String(next).padStart(3, "0")}`;

    try {
      // Each attempt runs in its own SAVEPOINT: in Postgres a failed statement
      // aborts the entire transaction, so without one a collision would poison
      // the caller's transaction and the retry could never succeed.
      ledger = await sequelize.transaction({ transaction }, (savepoint) =>
        models.Ledger.create(
          {
            ledger_no,
            ledger_group_id: sundryDebtors.id,
            // ledger_name is NOT NULL; an online customer has no name at OTP time.
            ledger_name: customer.customer_name || customer.mobile_number,
            branch_id: customer.branch_id,
          },
          { transaction: savepoint }
        )
      );
      break;
    } catch (err) {
      if (err.name !== "SequelizeUniqueConstraintError" || attempt >= 4) throw err;
    }
  }

  await customer.update({ ledger_id: ledger.id }, { transaction });

  return ledger.id;
};

// Keeps the ledger's display name in step with the customer's. Online customers
// are created ledger-named after their mobile number, so this is what gives
// them a proper name once they complete their profile.
const syncCustomerLedgerName = async (customer, transaction) => {
  if (!customer.ledger_id || !customer.customer_name) return;

  const ledger = await models.Ledger.findByPk(customer.ledger_id, { transaction });
  if (!ledger || ledger.ledger_name === customer.customer_name) return;

  await ledger.update({ ledger_name: customer.customer_name }, { transaction });
};

// Create customer
const createCustomer = async (req, res) => {
  let transaction;
 
  try {
    console.log("CreateCustomer API called");
    console.log("Request Body:", req.body);
 
    const required = ["customer_name", "mobile_number"];
 
    for (const f of required) {
      if (
        req.body?.[f] === undefined ||
        req.body?.[f] === null ||
        req.body?.[f] === ""
      ) {
        console.log("Missing required field:", f);
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
    }
 
    const payload = {
      customer_code: req.body.customer_code?.trim() || null,
      customer_name: req.body.customer_name?.trim() || null,
      mobile_number: req.body.mobile_number?.trim(),
      branch_id: req.body.branch_id ? Number(req.body.branch_id) : null,
      email_id: req.body.email_id?.trim() || null,
      gst_no: req.body.gst_no?.trim() || null,
      address: req.body.address?.trim() || null,
      country_id: req.body.country_id ? Number(req.body.country_id) : null,
      state_id: req.body.state_id ? Number(req.body.state_id) : null,
      district_id: req.body.district_id ? Number(req.body.district_id) : null,
      pin_code: req.body.pin_code?.trim() || null,
      pan_no: req.body.pan_no?.trim() || null,
      is_online: Boolean(req.body.is_online),
    };
 
    console.log("Payload Prepared:", payload);
 
    // Run duplicate checks before transaction
    const checks = [
      models.Customer.findOne({
        where: {
          mobile_number: payload.mobile_number,
          deleted_at: null,
        },
        attributes: ["id"],
      }),
    ];
 
    if (payload.customer_code) {
      console.log("Checking duplicate customer_code:", payload.customer_code);
 
      checks.push(
        models.Customer.findOne({
          where: {
            customer_code: payload.customer_code,
            deleted_at: null,
          },
          attributes: ["id"],
        })
      );
    }
 
    const [existingMobile, existingCode] = await Promise.all(checks);
 
    console.log("Duplicate Mobile Check:", existingMobile);
    console.log("Duplicate Code Check:", existingCode);
 
    if (existingMobile) {
      console.log("Mobile number already exists");
      return commonService.badRequest(res, {
        message: "Mobile number already exists",
      });
    }
 
    if (existingCode) {
      console.log("Customer code already exists");
      return commonService.badRequest(res, {
        message: "Customer code already exists",
      });
    }
 
    // Start transaction only when write begins
    console.log("Starting DB Transaction...");
    transaction = await sequelize.transaction();
 
    const customer = await models.Customer.create(payload, { transaction });
 
    console.log("Customer created:", customer.id);
 
    const ledgerId = await ensureCustomerLedger(customer, transaction);

    console.log("Customer updated with ledger_id:", ledgerId);

    await transaction.commit();
    console.log("Transaction committed successfully");
 
    return commonService.createdResponse(res, { customer });
 
  } catch (err) {
    console.error("CreateCustomer Error:", err);
 
    if (transaction) {
      console.log("Rolling back transaction...");
      await transaction.rollback();
    }
 
    return commonService.handleError(res, err);
  }
};

// List customers (simple filters)
const listCustomersWithMobileNumber = async (req, res) => {
  try {
    const { search, mobile_number, branch_id } = req.query;

    // Build WHERE conditions dynamically
    let whereClause = "WHERE c.deleted_at IS NULL";
    const replacements = {};

    if (branch_id) {
      whereClause += " AND c.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    if (mobile_number) {
      whereClause += " AND c.mobile_number = :mobile_number";
      replacements.mobile_number = mobile_number;
    }

    if (search) {
      whereClause += `
        AND (
          c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }

    const query = `
      SELECT
        c.id,
        c.customer_code,
        c.customer_name,
        c.mobile_number,
        c.address,
        c.country_id,
        c.branch_id,
        c.state_id,
        c.district_id,
        c.pin_code,
        c.created_at,
        c.updated_at,
        co.country_name,
        s.state_name,
        d.district_name
      FROM customers c
      LEFT JOIN countries co ON c.country_id = co.id
      LEFT JOIN states s ON c.state_id = s.id
      LEFT JOIN districts d ON c.district_id = d.id
      ${whereClause}
      ORDER BY c.created_at DESC
    `;

    const customers = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      replacements,
    });

    return commonService.okResponse(res, { customers });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get by id
const getCustomerById = async (req, res) => {
  try {
    const customer = await models.Customer.findOne({
      where: { id: req.params.id, deleted_at: null }
    });

    if (!customer) {
      return commonService.badRequest(res, "Customer not found");
    }

    let branch_name = null;

    if (customer.branch_id) {
      const branch = await models.Branch.findOne({
        where: { id: customer.branch_id, deleted_at: null },
        attributes: ["branch_name"]
      });

      branch_name = branch?.branch_name || null;
    }

    return commonService.okResponse(res, {
      customer: {
        ...customer.toJSON(),
        branch_name   // ✅ added manually
      }
    });

  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update
const updateCustomer = async (req, res) => {
  const entity = await commonService.findById(models.Customer, req.params.id, res);
  if (!entity) return;
  try {
    // Validate code uniqueness if user tries to change it
    if (req.body.customer_code && req.body.customer_code !== entity.customer_code) {
      const existing = await models.Customer.findOne({
        where: {
          customer_code: req.body.customer_code,
          deleted_at: null,
          id: { [Op.ne]: entity.id }, // exclude the current customer
        },
      });

      if (existing) {
        return commonService.badRequest(res, {
          message: "Customer code already exists",
        });
      }
    }

    // Validate mobile number uniqueness (NEW — same as create)
    if (req.body.mobile_number && req.body.mobile_number !== entity.mobile_number) {
      const existingMobile = await models.Customer.findOne({
        where: {
          mobile_number: req.body.mobile_number,
          deleted_at: null,
          id: { [Op.ne]: entity.id }, // exclude current customer
        },
      });

      if (existingMobile) {
        return commonService.badRequest(res, {
          message: "Mobile number already exists",
        });
      }
    }

    const up = {
      customer_code: req.body.customer_code ?? entity.customer_code,
      customer_name: req.body.customer_name ?? entity.customer_name,
      mobile_number: req.body.mobile_number ?? entity.mobile_number,
      address: req.body.address ?? entity.address,
      country_id: req.body.country_id !== undefined ? +req.body.country_id : entity.country_id,
      state_id: req.body.state_id !== undefined ? +req.body.state_id : entity.state_id,
      district_id: req.body.district_id !== undefined ? +req.body.district_id : entity.district_id,
      pin_code: req.body.pin_code ?? entity.pin_code,
      pan_no: req.body.pan_no ?? entity.pan_no,
      gst_no: req.body.gst_no ?? entity.gst_no,
      email_id: req.body.email_id ?? (entity.email_id || null),
      is_online: req.body.is_online !== undefined ? Boolean(req.body.is_online) : entity.is_online,
      branch_id: req.body.branch_id !== undefined ? (+req.body.branch_id || null) : entity.branch_id,
    };

    // The profile update is the point where an online customer finally has a
    // real name, so it both backfills a missing ledger (customers registered
    // through the OTP flow before ensureCustomerLedger existed) and renames the
    // mobile-number-named ledger. Transactional so the customer row and its
    // ledger can never disagree.
    const transaction = await sequelize.transaction();
    try {
      await entity.update(up, { transaction });
      await ensureCustomerLedger(entity, transaction);
      await syncCustomerLedgerName(entity, transaction);
      await transaction.commit();
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }

    return commonService.okResponse(res, { customer: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteCustomer = async (req, res) => {
  const entity = await commonService.findById(models.Customer, req.params.id, res);
  if (!entity) return;
  try {
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Generate auto code: CUS-0001
const generateCustomerCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Customer,
      "customer_code",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { customer_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateOnlineCustomerCode = async () => {
  const code = await generateFiscalSeriesCode(
    models.Customer,
    "customer_code",
    "COD",
    { pad: 3 }
  );
  return code;
};
// Dropdown: customer names and mobile numbers
const listCustomerMobilesDropdown = async (req, res) => {
  try {
    const rows = await models.Customer.findAll({
      attributes: ['id', 'customer_name', 'mobile_number'],
      order: [["customer_name", "ASC"]],
      where: {
        deleted_at: null,
        mobile_number: { [Op.ne]: null }
      },
    });

    const mobiles = rows
      .map((r) => ({
        id: r.id,
        customer_name: r.customer_name || '',
        mobile: r.mobile_number,
      }))
      .filter(item => item.mobile);

    return commonService.okResponse(res, { mobiles });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Dropdown: customer name + mobile with light search - billing section
const listCustomerNameMobileDropdown = async (req, res) => {
  try {
    const { search = "", branch_id } = req.query;

    const searchTerm = String(search).trim();

    let whereClause = "";
    const replacements = {};

    if (searchTerm) {
      whereClause = `
        AND (
          c.customer_name ILIKE :search OR
          c.mobile_number ILIKE :search OR
          c.customer_code ILIKE :search
        )
      `;
      replacements.search = `%${searchTerm}%`;
    }

    if (branch_id) {
      whereClause += " AND c.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    const query = `
      SELECT 
        c.id,
        c.customer_name,
        c.mobile_number,
        c.address,
        c.pin_code,
        c.customer_code,
        c.created_at,
        c.pan_no,
        c.gst_no,
        co.country_name,
        s.state_name,
        d.district_name
      FROM customers c
      LEFT JOIN countries co  ON co.id = c.country_id  AND co.deleted_at IS NULL
      LEFT JOIN states s      ON s.id = c.state_id     AND s.deleted_at IS NULL
      LEFT JOIN districts d   ON d.id = c.district_id  AND d.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
        ${whereClause}
      ORDER BY c.created_at DESC
    `;

    const customers = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
      raw: true
    });

    // Clean & safe output
    const formatted = customers.map(c => ({
      id: c.id,
      customer_name: c.customer_name || "",
      mobile_number: c.mobile_number || "",
      customer_code: c.customer_code || null,
      pan_no: c.pan_no || null,
      gst_no: c.gst_no || null,
      address: c.address || "",
      pin_code: c.pin_code || "",
      country_name: c.country_name || "",
      state_name: c.state_name || "",
      district_name: c.district_name || "",
      created_at: c.created_at
    }));

    return commonService.okResponse(res, { customers: formatted });

  } catch (err) {
    console.error("listCustomerNameMobileDropdown error:", err);
    return commonService.handleError(res, err);
  }
};

// List Customer Page
const listCustomers = async (req, res) => {
  try {
    const { search, mode, branch_id, page = 1, limit } = req.query || {};

    // Pagination
    const pageNumber = parseInt(page, 10) || 1;
    const pageSize = limit ? parseInt(limit, 10) : null;
    const offset = pageSize ? (pageNumber - 1) * pageSize : 0;

    // Query replacements
    const replacements = {};

    if (search) replacements.search = `%${search}%`;
    if (branch_id) replacements.branch_id = parseInt(branch_id, 10);

    let sql = `
      SELECT
        c.id,
        c.customer_code AS customer_no,
        c.customer_name,
        c.is_online,
        c.mobile_number,

        -- Count offline invoices and online orders
        (
          SELECT COUNT(*)
          FROM (
            SELECT sib_count.id
            FROM sales_invoice_bills sib_count
            WHERE sib_count.customer_id = c.id
              AND sib_count.deleted_at IS NULL
              AND sib_count.status = 'Invoice'
              AND sib_count.is_active = true
              ${branch_id ? `AND sib_count.branch_id = :branch_id` : ''}

            UNION ALL

            SELECT o_count.id
            FROM orders o_count
            WHERE o_count.customer_id = c.id
              AND o_count.deleted_at IS NULL
              AND o_count.order_status <> 3
              ${branch_id ? `
                AND EXISTS (
                  SELECT 1
                  FROM order_items oi_count
                  WHERE oi_count.order_id = o_count.id
                    AND oi_count.branch_id = :branch_id
                    AND oi_count.deleted_at IS NULL
                    AND oi_count.item_status <> 'Cancelled'
                )
              ` : ''}
          ) all_orders
        ) AS no_of_orders,

        c.created_at,
        COUNT(*) OVER() AS total_count,

        CASE
          WHEN c.is_online = true THEN 'Online'
          ELSE 'Offline'
        END AS mode,

        -- Get branch ID from latest offline invoice or online order
        COALESCE(
          (
            SELECT latest_branch.branch_id
            FROM (
              SELECT
                sib_branch.branch_id,
                sib_branch.created_at
              FROM sales_invoice_bills sib_branch
              WHERE sib_branch.customer_id = c.id
                AND sib_branch.deleted_at IS NULL
                AND sib_branch.status = 'Invoice'
                AND sib_branch.is_active = true
                ${branch_id ? `AND sib_branch.branch_id = :branch_id` : ''}

              UNION ALL

              SELECT
                oi_branch.branch_id,
                o_branch.created_at
              FROM orders o_branch
              INNER JOIN order_items oi_branch
                ON oi_branch.order_id = o_branch.id
                AND oi_branch.deleted_at IS NULL
                AND oi_branch.item_status <> 'Cancelled'
              WHERE o_branch.customer_id = c.id
                AND o_branch.deleted_at IS NULL
                AND o_branch.order_status <> 3
                ${branch_id ? `AND oi_branch.branch_id = :branch_id` : ''}
            ) latest_branch
            ORDER BY latest_branch.created_at DESC
            LIMIT 1
          ),
          c.branch_id
        ) AS branch_id,

        -- Get branch name from latest offline invoice or online order
        COALESCE(
          (
            SELECT b.branch_name
            FROM (
              SELECT
                sib_branch.branch_id,
                sib_branch.created_at
              FROM sales_invoice_bills sib_branch
              WHERE sib_branch.customer_id = c.id
                AND sib_branch.deleted_at IS NULL
                AND sib_branch.status = 'Invoice'
                AND sib_branch.is_active = true
                ${branch_id ? `AND sib_branch.branch_id = :branch_id` : ''}

              UNION ALL

              SELECT
                oi_branch.branch_id,
                o_branch.created_at
              FROM orders o_branch
              INNER JOIN order_items oi_branch
                ON oi_branch.order_id = o_branch.id
                AND oi_branch.deleted_at IS NULL
                AND oi_branch.item_status <> 'Cancelled'
              WHERE o_branch.customer_id = c.id
                AND o_branch.deleted_at IS NULL
                AND o_branch.order_status <> 3
                ${branch_id ? `AND oi_branch.branch_id = :branch_id` : ''}
            ) latest_branch
            LEFT JOIN branches b ON b.id = latest_branch.branch_id
            ORDER BY latest_branch.created_at DESC
            LIMIT 1
          ),
          (
            SELECT b2.branch_name
            FROM branches b2
            WHERE b2.id = c.branch_id
          )
        ) AS branch,

        -- Calculate offline invoice amount and online order amount
        (
          COALESCE(
            (
              SELECT SUM(sib_amount.total_amount)
              FROM sales_invoice_bills sib_amount
              WHERE sib_amount.customer_id = c.id
                AND sib_amount.deleted_at IS NULL
                AND sib_amount.status = 'Invoice'
                AND sib_amount.is_active = true
                ${branch_id ? `AND sib_amount.branch_id = :branch_id` : ''}
            ),
            0
          )
          +
          ${branch_id ? `
            COALESCE(
              (
                SELECT SUM(oi_amount.total_amount)
                FROM orders o_amount
                INNER JOIN order_items oi_amount
                  ON oi_amount.order_id = o_amount.id
                  AND oi_amount.deleted_at IS NULL
                  AND oi_amount.item_status <> 'Cancelled'
                WHERE o_amount.customer_id = c.id
                  AND o_amount.deleted_at IS NULL
                  AND o_amount.order_status <> 3
                  AND oi_amount.branch_id = :branch_id
              ),
              0
            )
          ` : `
            COALESCE(
              (
                SELECT SUM(o_amount.total_amount)
                FROM orders o_amount
                WHERE o_amount.customer_id = c.id
                  AND o_amount.deleted_at IS NULL
                  AND o_amount.order_status <> 3
              ),
              0
            )
          `}
        ) AS purchase_amount,

        -- Check whether customer has scheme
        EXISTS (
          SELECT 1
          FROM customer_enrollments ce
          WHERE ce.customer_id = c.id
            AND ce.deleted_at IS NULL
        ) AS has_scheme

      FROM customers c
      WHERE c.deleted_at IS NULL
    `;

    // Search filter
    if (search) {
      sql += `
        AND (
          c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
          OR c.customer_code ILIKE :search
        )
      `;
    }

    // Mode filter based on customers.is_online
    if (mode) {
      const normalizedMode = String(mode).toLowerCase();

      if (normalizedMode === 'offline') {
        sql += `
          AND c.is_online = false
        `;
      } else if (normalizedMode === 'online') {
        sql += `
          AND c.is_online = true
        `;
      }
    }

    // Branch filter
    if (branch_id) {
      sql += `
        AND (
          c.branch_id = :branch_id
          OR EXISTS (
            SELECT 1
            FROM sales_invoice_bills sib_filter
            WHERE sib_filter.customer_id = c.id
              AND sib_filter.branch_id = :branch_id
              AND sib_filter.deleted_at IS NULL
              AND sib_filter.status = 'Invoice'
              AND sib_filter.is_active = true
          )
          OR EXISTS (
            SELECT 1
            FROM orders o_filter
            INNER JOIN order_items oi_filter
              ON oi_filter.order_id = o_filter.id
              AND oi_filter.deleted_at IS NULL
              AND oi_filter.item_status <> 'Cancelled'
            WHERE o_filter.customer_id = c.id
              AND o_filter.deleted_at IS NULL
              AND o_filter.order_status <> 3
              AND oi_filter.branch_id = :branch_id
          )
        )
      `;
    }

    // Sorting
    sql += ` ORDER BY c.created_at DESC`;

    // Pagination
    if (pageSize) {
      sql += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = pageSize;
      replacements.offset = offset;
    }

    // Execute query
    const customers = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Get total customer count
    const totalCount = customers.length > 0
      ? Number(customers[0].total_count)
      : 0;

    // Format response
    const formattedCustomers = customers.map((customer) => ({
      id: customer.id,
      customer_no: customer.customer_no,
      customer_name: customer.customer_name,
      mobile_number: customer.mobile_number,
      no_of_orders: Number(customer.no_of_orders || 0),
      is_online: customer.is_online ?? null,
      mode: customer.mode ?? null,
      branch_id: customer.branch_id ?? null,
      branch: customer.branch ?? null,
      purchase_amount: Number(customer.purchase_amount || 0).toFixed(2),
      scheme_details: customer.has_scheme ? 'Yes' : 'No',
      created_at: customer.created_at,
    }));

    // Send response
    return commonService.okResponse(res, {
      customers: formattedCustomers,
      pagination: pageSize
        ? {
            total: totalCount,
            page: pageNumber,
            limit: pageSize,
            total_pages: Math.ceil(totalCount / pageSize),
          }
        : null,
    });
  } catch (error) {
    console.error('Error in listCustomers:', error);
    return commonService.handleError(res, error);
  }
};

// Get top buying customers ranked by total invoice value across all branches (or specific branch)
const getTopBuyingCustomers = async (req, res) => {
  try {
    const { limit = 10, branch_id } = req.query;

    // Build WHERE clause for branch filter
    let branchFilter = '';
    const replacements = { limit: parseInt(limit, 10) };

    if (branch_id) {
      branchFilter = 'AND sib.branch_id = :branch_id';
      replacements.branch_id = parseInt(branch_id, 10);
    }

    const query = `
      SELECT 
        c.id AS customer_id,
        c.customer_code,
        c.customer_name,
        c.mobile_number,
        COALESCE(SUM(
          (
            SELECT COALESCE(SUM(sibi.amount * (sibi.quantity - COALESCE(sibi.returned_quantity, 0)) / NULLIF(sibi.quantity, 0)), 0)
            FROM sales_invoice_bill_items sibi
            WHERE sibi.invoice_bill_id = sib.id
              AND sibi.deleted_at IS NULL
          )
        ), 0) AS total_amount,
        COUNT(sib.id) AS total_invoices
      FROM
        customers c
      LEFT JOIN
        sales_invoice_bills sib ON sib.customer_id = c.id
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
        AND sib.status = 'Invoice'
        ${branchFilter}
      WHERE
        c.deleted_at IS NULL
      GROUP BY
        c.id, c.customer_code, c.customer_name, c.mobile_number
      HAVING
        COALESCE(SUM(
          (
            SELECT COALESCE(SUM(sibi.amount * (sibi.quantity - COALESCE(sibi.returned_quantity, 0)) / NULLIF(sibi.quantity, 0)), 0)
            FROM sales_invoice_bill_items sibi
            WHERE sibi.invoice_bill_id = sib.id
              AND sibi.deleted_at IS NULL
          )
        ), 0) > 0
      ORDER BY 
        total_amount DESC
      LIMIT :limit
    `;

    const topCustomers = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedCustomers = topCustomers.map(customer => ({
      customer_id: customer.customer_id,
      customer_code: customer.customer_code,
      customer_name: customer.customer_name,
      mobile_number: customer.mobile_number,
      total_amount: parseFloat(customer.total_amount || 0).toFixed(2),
      total_invoices: parseInt(customer.total_invoices, 10),
    }));

    return commonService.okResponse(res, {
      top_buying_customers: formattedCustomers
    });
  } catch (err) {
    console.error('Error in getTopBuyingCustomers:', err);
    return commonService.handleError(res, err);
  }
};

// Get the customer enrolled scheme details
const getCustomerSchemes = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const rows = await sequelize.query(
      `
      SELECT
        ce.id AS enrollment_id,
        ce.customer_id,
        ce.scheme_plan_id,
        ce.enrollment_code,
        ce.installment_amount_id as installment_amount,
        s.scheme_name,
        s.min_amount
      FROM customer_enrollments ce
      JOIN schemes s 
        ON s.id = ce.scheme_plan_id
        AND s.deleted_at IS NULL
      WHERE ce.customer_id = :customer_id
      AND ce.deleted_at IS NULL
      AND ce.status = 'Active'
      `,
      {
        replacements: { customer_id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    return commonService.okResponse(res, {
      schemes: rows
    });

  } catch (err) {
    return commonService.handleError(res, err);
  }
};

//Get Customer Transactions (Invoices + Returns + Old Jewel + Repairs) with filters
const getCustomerTransactions = async (req, res) => {
  try {
    const { customer_id } = req.params; 
    const { from, to, date, branch_id, order_type, search} = req.query;

    if (!customer_id) {
      return commonService.badRequest(res, {
        message: "customer_id is required"
      });
    }

    let conditions = ` WHERE t.customer_id = :customer_id AND t.deleted_at IS NULL `;
    const replacements = { customer_id };

    // Date filters
    if (from) {
      conditions += ` AND t.date >= :from`;
      replacements.from = from;
    }

    if (to) {
      conditions += ` AND t.date <= :to`;
      replacements.to = to;
    }

    if (date) {
      conditions += ` AND DATE(t.date) = :date`;
      replacements.date = date;
    }

    // Branch filter
    if (branch_id) {
      conditions += ` AND t.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    // Search filter
    if (search) {
      conditions += ` AND (
        t.reference_no ILIKE :search OR
        t.product_name ILIKE :search
      )`;
      replacements.search = `%${search}%`;
    }

    // Order type (only applies to invoice + return)
    if (order_type) {
      orderTypeCondition = ` AND order_type = :order_type`;
      replacements.order_type = order_type;
    }

    const sql = `
      SELECT * FROM (

        -- 🧾 INVOICE
        SELECT
          i.id,
          i.customer_id,
          i.invoice_no AS reference_no,
          i.invoice_date AS date,
          i.total_amount,
          i.amount_due,

          JSON_AGG(
            JSON_BUILD_OBJECT(
              'product_name', ii.product_name_snapshot,
              'quantity', ii.quantity
            )
          ) FILTER (WHERE ii.id IS NOT NULL) AS items,

          SUM(ii.quantity) AS total_quantity,

          i.branch_id,
          MAX(b.branch_name) AS branch_name,   -- ✅ FIX
          i.order_type::TEXT AS order_type,
          'INVOICE' AS type,
          i.created_at,
          i.deleted_at

        FROM sales_invoice_bills i
        LEFT JOIN sales_invoice_bill_items ii
          ON ii.invoice_bill_id = i.id AND ii.deleted_at IS NULL
        LEFT JOIN branches b
          ON b.id = i.branch_id AND b.deleted_at IS NULL

        WHERE i.deleted_at IS NULL AND i.status = 'Invoice' AND i.is_active = true
        GROUP BY i.id

        UNION ALL

        -- 🔁 SALES RETURN
        SELECT
          sr.id,
          sr.customer_id,
          sr.sales_return_no AS reference_no,
          sr.return_date AS date,
          sr.total_amount,
          NULL AS amount_due,

          JSON_AGG(
            JSON_BUILD_OBJECT(
              'product_name', sri.product_description,
              'quantity', sri.quantity
            )
          ) FILTER (WHERE sri.id IS NOT NULL) AS items,

          SUM(sri.quantity) AS total_quantity,

          sr.branch_id,
          MAX(b.branch_name) AS branch_name,
          MAX(sr.order_type)::TEXT AS order_type,
          'SALES_RETURN' AS type,
          sr.created_at,
          sr.deleted_at

        FROM sales_returns sr
        LEFT JOIN sales_return_items sri
          ON sri.sales_return_id = sr.id AND sri.deleted_at IS NULL
        LEFT JOIN branches b
          ON b.id = sr.branch_id AND b.deleted_at IS NULL

        WHERE sr.deleted_at IS NULL AND sr.status = 'Printed' AND sr.is_active = true
        GROUP BY sr.id

        UNION ALL

        -- 🪙 OLD JEWEL
        SELECT
          oj.id,
          oj.customer_id,
          oj.old_jewel_code AS reference_no,
          oj.date,
          oj.total_amount,
          NULL AS amount_due,

          JSON_AGG(
            JSON_BUILD_OBJECT(
              'product_name', oji.jewel_description,
              'quantity', 1
            )
          ) FILTER (WHERE oji.id IS NOT NULL) AS items,

          COUNT(oji.id) AS total_quantity,

          oj.branch_id,
          MAX(b.branch_name) AS branch_name,
          'Offline' AS order_type,
          'OLD_JEWEL' AS type,
          oj.created_at,
          oj.deleted_at

        FROM old_jewels oj
        LEFT JOIN old_jewel_items oji
          ON oji.old_jewel_id = oj.id AND oji.deleted_at IS NULL
        LEFT JOIN branches b
          ON b.id = oj.branch_id AND b.deleted_at IS NULL

        WHERE oj.deleted_at IS NULL AND oj.status = 'Printed' AND oj.is_active = true
        GROUP BY oj.id

        UNION ALL

        -- 🔧 JEWEL REPAIR
        SELECT
          jr.id,
          jr.customer_id,
          jr.repair_code AS reference_no,
          jr.date,
          jr.total_amount,
          jr.amount_due,

          JSON_AGG(
            JSON_BUILD_OBJECT(
              'product_name', jri.description,
              'quantity', jri.quantity
            )
          ) FILTER (WHERE jri.id IS NOT NULL) AS items,

          SUM(jri.quantity) AS total_quantity,

          jr.branch_id,
          MAX(b.branch_name) AS branch_name,
          'Offline' AS order_type,
          'JEWEL_REPAIR' AS type,
          jr.created_at,
          jr.deleted_at

        FROM jewel_repairs jr
        LEFT JOIN jewel_repair_items jri
          ON jri.repair_id = jr.id AND jri.deleted_at IS NULL
        LEFT JOIN branches b
          ON b.id = jr.branch_id AND b.deleted_at IS NULL

        WHERE jr.deleted_at IS NULL AND jr.status = 'Completed' AND jr.is_active = true
        GROUP BY jr.id

        UNION ALL

        -- 🛒 ONLINE ORDERS
        SELECT
          ooi.id,
          ooi.customer_id,
          ooi.invoice_no AS reference_no,
          ooi.invoice_date AS date,
          ooi.total_amount,
          NULL AS amount_due,

          JSON_AGG(
              JSON_BUILD_OBJECT(
                  'product_name', oii.product_name,
                  'quantity', oii.quantity
              )
          ) FILTER (WHERE oii.id IS NOT NULL) AS items,

          SUM(oii.quantity) AS total_quantity,

          ooi.branch_id,
          MAX(b.branch_name) AS branch_name,

          'Online' AS order_type,
          'ONLINE_ORDER' AS type,

          ooi.created_at,
          ooi.deleted_at

      FROM online_order_invoices ooi

      LEFT JOIN online_order_invoice_items oii
          ON oii.online_order_invoice_id = ooi.id
          AND oii.deleted_at IS NULL

      LEFT JOIN branches b
          ON b.id = ooi.branch_id
          AND b.deleted_at IS NULL

      WHERE
          ooi.deleted_at IS NULL

      GROUP BY ooi.id

      ) t

      WHERE t.customer_id = :customer_id
        AND t.deleted_at IS NULL

        ${from ? 'AND t.date >= :from' : ''}
        ${to ? 'AND t.date <= :to' : ''}
        ${date ? 'AND DATE(t.date) = :date' : ''}
        ${branch_id ? 'AND t.branch_id = :branch_id' : ''}

        ${search ? `AND (
          t.reference_no ILIKE :search OR
          EXISTS (
            SELECT 1 FROM JSON_ARRAY_ELEMENTS(t.items) elem
            WHERE elem->>'product_name' ILIKE :search
          )
        )` : ''}

        ${order_type ? 'AND t.order_type = :order_type' : ''}

      ORDER BY t.date DESC, t.created_at DESC;
      `;

    const data = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Final UI Format
   const formatted = data.map((item, index) => ({
      s_no: index + 1,
      date: item.date,
      reference_no: item.reference_no,

      // ✅ FIX HERE
      product_name: item.items?.map(i => i.product_name).join(", ") || "-",
      quantity: Number(item.total_quantity || 0),

      total_amount: Number(item.total_amount),
      amount_due: Number(item.amount_due),
      branch_id: item.branch_id,
      order_type: item.order_type || "-",
      type: item.type,

      
      items: item.items || [],
      created_at: item.created_at,
      deleted_at: item.deleted_at,
      branch_name: item.branch_name || null,
    }));

    return commonService.okResponse(res, {
      transactions: formatted
    });

  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createCustomer,
  listCustomersWithMobileNumber,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  generateCustomerCode,
  listCustomerMobilesDropdown,
  listCustomerNameMobileDropdown,
  listCustomers,
  generateOnlineCustomerCode,
  ensureCustomerLedger,
  syncCustomerLedgerName,
  getTopBuyingCustomers,
  getCustomerSchemes,
  getCustomerTransactions
};
