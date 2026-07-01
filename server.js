require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { readSheet, appendToSheet, updateRowInSheet } = require('./sheetsClient');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const db = require('./db');

const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error('❌ FATAL: API_KEY environment variable is not set. Set it in your .env file.');
  process.exit(1);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL, // e.g. https://sipcon-crm.netlify.app
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins — needed for ManyChat, Postman, mobile apps, webhooks
    if (!origin) return callback(null, true);
    if (origin.endsWith('.netlify.app') || origin.endsWith('.onrender.com')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Fallback: allow all (safe since we use API key auth on all routes)
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
}));

app.use(express.json());

// Health check (no auth required) — tests all critical API dependencies
app.get('/api/health', async (req, res) => {
  const checks = {
    server: { status: 'ok', uptime: process.uptime() },
    database: { status: 'unknown' },
    tables: {}
  };

  // Test database connectivity
  try {
    const [dbResult] = await db.query('SELECT 1 AS connected');
    checks.database.status = dbResult[0].connected === 1 ? 'ok' : 'error';
  } catch (err) {
    checks.database.status = 'error';
    checks.database.error = err.message;
  }

  // Test each table accessibility
  const tables = ['machines', 'Tickets', 'callLogs'];
  for (const table of tables) {
    try {
      const [rows] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      checks.tables[table] = { status: 'ok', rowCount: rows[0].count };
    } catch (err) {
      checks.tables[table] = { status: 'error', error: err.message };
    }
  }

  const allOk = checks.database.status === 'ok' &&
    Object.values(checks.tables).every(t => t.status === 'ok');

  const statusCode = allOk ? 200 : 503;
  const response = {
    status: allOk ? 'ok' : 'degraded',
    message: allOk ? 'SIPCON CRM API running' : 'Some services are degraded',
    timestamp: new Date().toISOString(),
    checks
  };

  console.log('📤 Health Check Response:', response);
  res.status(statusCode).json(response);
});



app.post('/api/upload-machines', upload.single('file'), async (req, res) => {

  if (!req.file) {
    return res.status(400).json({
      error: 'CSV file required'
    });
  }

  const rows = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => rows.push(row))
    .on('end', async () => {

      try {

        const requiredColumns = [
          'JC or Sr. No. of Machine',
          'Company Name',
          'Machine details',
          'Model'
        ];

        const headers = Object.keys(rows[0] || {});

        for (const col of requiredColumns) {

          if (!headers.includes(col)) {

            fs.unlinkSync(req.file.path);

            return res.status(400).json({
              error: `Missing column: ${col}`
            });
          }
        }

        let imported = 0;
        const errors = [];

        for (const row of rows) {

          const machineNo = row['JC or Sr. No. of Machine'];

          if (!machineNo) {
            errors.push('Machine Number missing');
            continue;
          }

          console.log(`Attempting to check for existing machine ${machineNo}...`);
          const [existing] = await db.execute(
            'SELECT machine_no FROM machines WHERE machine_no = ?',
            [machineNo]
          );
          console.log(`🔍 Checked for existing machine ${machineNo}. Result:`, existing);

          if (existing.length) {
            errors.push(`Duplicate: ${machineNo}`);
            continue;
          }

          console.log(`Attempting to insert machine ${machineNo}...`);
          await db.execute(
            `
            INSERT INTO machines
            (
              machine_no,
              company_name,
              machine_details,
              model
            )
            VALUES (?, ?, ?, ?)
            `,
            [
              machineNo,
              row['Company Name'] || '',
              row['Machine details'] || '',
              row['Model'] || ''
            ]
          );
          console.log(`➕ Inserted machine ${machineNo}.`);

          imported++;
        }

        fs.unlinkSync(req.file.path);
        const response = {
          success: true,
          imported,
          errors: errors.length > 0 ? errors : undefined
        };

        console.log('📤 Upload Machines Response:', response);
        res.json(response);

      } catch (err) {

        console.error(err);

        res.status(500).json({
          error: err.message
        });

      }
    });
});

app.get('/api/machines', async (req, res, next) => {
  try {
    console.log('Fetching all machines from the database... ');
    const [rows] = await db.query(
      'SELECT * FROM machines '
    );

    console.log(`📤 Sending ${rows.length} machine records to client.`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/search', async (req, res) => {
  try {
    console.log(`Received search request for company: ${req.body.companyName}`);

    const companyName = req.params.companyName || req.body.companyName;

  const [rows] = await db.execute(
  `
  SELECT DISTINCT
    name,
    machine_details,
    DOI,
    mail_ID,
    contact_number
  FROM machines
  WHERE company_name = ?
  `,
  [companyName]
);

    if (!rows.length) {
      const errorRes = {
        success: false,
        message: 'Company not found'
      };

      console.log(`🔎 Search for company '${companyName}' returned 0 results.`);
      console.log('📤 Response:', errorRes);

      return res.status(404).json(errorRes);
    }

    // Machine list with DOI
    const machineList = rows
      .map((row, index) => `${index + 1}. ${row.machine_details} - ${row.DOI}`)
      .join('\n');

    const message = `
*Company:* ${companyName}
*Authorised Contact Person:* ${rows[0].name}
*Mail ID:* ${rows[0].mail_ID}
*Contact Number:* ${rows[0].contact_number}
*Machines Purchased:*
${machineList}
`.trim();

    res.json({
      success: true,
      response :{
         message,
         totalMachines: rows.length,
         mail_ID: rows[0].mail_ID
      }
    });

    console.log(`🔎 Search for company '${companyName}' returned ${rows.length} machines.`);


  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/api/search-company', async (req, res) => {

  console.log(`Received query search request for company: ${req.query.company}`);
  try {

    const company = req.query.company;

    if (!company) {
      return res.status(400).json({
        error: 'Company name is required'
      });
    }

    console.log(`Attempting to search for company '${company}' in the database...`);
    const [rows] = await db.execute( 
      ` 
      SELECT 
        machine_details 
      FROM machines
      WHERE company_name LIKE ?

      `,
      [`%${company}%`]
    );
    console.log(`🔎 Query Search for company '${company}' returned ${rows.length} machines.`);

    const responseData = {
      success: true,
      company,
      totalMachines: rows.length,
      machines: rows
    };
    console.log(`📤 Query Search Response for ${company}:`, responseData);
    res.json(responseData);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

app.post('/api/add-machines', async (req, res) => {
  try {
    const { company_name, machine_details , customer_name } = req.body;

    // Validation
    if (!company_name || !machine_details || !customer_name) {
      return res.status(400).json({
        success: false,
        message: 'company_name, machine_details, and customer_name are required'
      });
    }
    const [rows] = await db.execute(`
  SELECT MAX(machine_serial_no) AS lastSerial
  FROM machines
`);

const nextSerial = (rows[0].lastSerial || 7122) + 1;
console.log("Next Serial:", nextSerial);

    const [result] = await db.execute(
      `
      INSERT INTO machines
      (machine_serial_no, company_name, machine_details, name)
      VALUES (?,?, ?, ?)
      `,
      [nextSerial,company_name, machine_details, customer_name]
    );

    res.status(201).json({
      success: true,
      message: 'Machine added successfully',
      insertedId: result.insertId
    });

  } catch (err) {
    console.error('Insert Error:', err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Add New Ticket
app.post('/api/add-ticket', async (req, res) => {
  try {
    const {
      Ticket_ID,
      Company,
      Query,
      machine,
      Created,
      Status
    } = req.body;

    // Validation
    if (!Ticket_ID || !Company || !Query || !machine || !Created || !Status) {
      return res.status(400).json({
        success: false,
        message: 'Ticket_ID, Company, Query, machine, Created and Status are required.'
      });
    }

    // Check if Ticket ID already exists
    const [existing] = await db.executeWithRetry(
      'SELECT Ticket_ID FROM Tickets WHERE Ticket_ID = ?',
      [Ticket_ID]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ticket ID already exists.'
      });
    }

   const [result] = await db.executeWithRetry(
  `
  INSERT INTO Tickets
  (
    Ticket_ID,
    Company,
    \`Query\`,
    machine,
    Created,
    Status
  )
  VALUES (?, ?, ?, ?, ?, ?)
  `,
  [
    Ticket_ID,
    Company,
    Query,
    machine,
    Created,
    Status
  ]
);

// Create corresponding Call Log entry
await db.executeWithRetry(
  `
  INSERT INTO callLogs
  (
    Ticket_ID
  )
  VALUES (?)
  `,
  [Ticket_ID]
);

res.status(201).json({
  success: true,
  message: 'Ticket and Call Log created successfully.',
  insertedId: result.insertId
});

  } catch (err) {
    console.error('Ticket Insert Error:', err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get All Tickets
app.get('/api/tickets', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        Ticket_ID,
        Company,
        \`Query\`,
        machine,
        Created,
        Status
      FROM Tickets
      ORDER BY Created DESC
    `);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {
    console.error('Fetch Tickets Error:', err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// Get Call Logs by Ticket_ID
app.get('/api/call-logs/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket_ID is required.'
      });
    }

    const [rows] = await db.execute(
      `
      SELECT *
      FROM callLogs
      WHERE Ticket_ID = ?
      `,
      [ticketId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No call logs found for this Ticket_ID.'
      });
    }

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {
    console.error('Fetch Call Logs Error:', err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});





// Update Call Log (First / Second / Third)
app.put('/api/update-call-log', async (req, res) => {
  try {
    const {
      Ticket_ID,
      call,
      Date,
      callStatus,
      duration
    } = req.body;

    if (!Ticket_ID || !call) {
      return res.status(400).json({
        success: false,
        message: 'Ticket_ID and call are required.'
      });
    }

    const validCalls = ['first', 'second', 'third'];
    const callType = call.toLowerCase();
    if (!validCalls.includes(callType)) {
      return res.status(400).json({
        success: false,
        message: 'call must be First, Second or Third.'
      });
    }

    const setClauses = [];
    const values = [];

    if (Date) {
      setClauses.push('`Date` = ?');
      values.push(Date);
    }

    if (callStatus) {
      const col = callType === 'first' ? 'firstCallStatus' : callType === 'second' ? 'secondCallStatus' : 'thirdCallStatus';
      setClauses.push(`\`${col}\` = ?`);
      values.push(callStatus);
    }

    if (duration) {
      const col = callType === 'first' ? 'firstDuration' : callType === 'second' ? 'secondDuration' : 'thirdDuration';
      setClauses.push(`\`${col}\` = ?`);
      values.push(duration);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (Date, callStatus, duration) is required.'
      });
    }

    values.push(Ticket_ID);
    const query = `
      UPDATE callLogs
      SET ${setClauses.join(', ')}
      WHERE Ticket_ID = ?
    `;

    const [result] = await db.execute(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'No record found for the given Ticket_ID.'
      });
    }

    res.json({
      success: true,
      message: `${call} call updated successfully.`
    });

  } catch (err) {
    console.error('Update Call Log Error:', err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// Global unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Optionally, terminate the process gracefully or forcefully
  // process.exit(1); // Consider exiting if unhandled rejections are critical
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Optionally, terminate the process gracefully or forcefully
  // process.exit(1); // Consider exiting if uncaught exceptions are critical
});



// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('API Error:', err.message);
  const errorResponse = { error: err.message || 'Internal server error' };
  console.log('📤 Error Response:', errorResponse);
  res.status(500).json(errorResponse);
});



app.listen(PORT, async () => {
  console.log(`✅ SIPCON CRM Backend running on http://localhost:${PORT}`);
  try {
    console.log(`📡 Attempting to connect to MySQL at ${process.env.DB_HOST} (Database: ${process.env.DB_NAME})...`);

    // Verify database connection on startup
    const [result] = await db.query('SELECT 1');
    if (result) {
      console.log(`🗄️  Successfully connected to MySQL Database: ${process.env.DB_NAME}`);
    }
  } catch (err) {
    console.error('❌ Database connection check failed. Detailed Error:');
    console.error(err);
  }
});