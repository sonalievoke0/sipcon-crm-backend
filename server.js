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

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  const response = { status: 'ok', message: 'SIPCON CRM API running', timestamp: new Date().toISOString() };
  console.log('📤 Health Check Response:', response);
  res.json(response);
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
        SELECT  DISTINCT
        machine_details 
        FROM machines
        WHERE company_name LIKE ?
        
      `,
      [`%${companyName}%`]
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

    const responseData = {
      success: true,
      company: companyName,
      totalMachines: rows.length,
      machines: rows
    };
    console.log(`📤 Search Result for ${companyName}:`, responseData);
    res.json(responseData);

  } catch (err) {

    console.error(err);

    res.status(500).json({
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