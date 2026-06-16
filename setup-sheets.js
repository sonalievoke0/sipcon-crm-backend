/**
 * setup-sheets.js
 * ───────────────
 * Run this ONCE after adding your credentials.json to:
 *   1. Create all CRM tabs in the Google Sheet
 *   2. Write headers for each tab
 *   3. Populate with initial data from mock data
 *
 * Usage:
 *   cd "c:\Users\sonal\sipcon CRM\backend"
 *   node setup-sheets.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const KEY_PATH = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials.json');

// ─── CRM Schema + Seed Data ──────────────────────────────────────────────────

const TABS = [
  {
    name: 'Companies',
    headers: ['company_id', 'company_name', 'city', 'industry', 'gst_or_reg_no', 'address', 'website', 'support_tier', 'account_manager', 'source', 'created_at', 'status'],
    rows: [
      ['COMP-001', 'TechCorp', '', 'SaaS', '', 'techcorp.com', 'techcorp.com', 'Enterprise', 'Alice Smith', 'Lead via assistant', '2023-01-10', 'Active'],
      ['COMP-002', 'Globex', '', 'Manufacturing', '', 'globex.com', 'globex.com', 'Standard', 'Bob Jones', 'Existing', '2023-02-15', 'Active'],
      ['COMP-003', 'Initech', '', 'Software', '', 'initech.com', 'initech.com', 'Premium', 'Charlie Brown', 'Existing', '2023-03-20', 'Inactive'],
    ]
  },
  {
    name: 'Contacts',
    headers: ['contact_id', 'company_id', 'full_name', 'designation', 'whatsapp_number', 'callback_number', 'email', 'is_primary'],
    rows: [
      ['1', 'COMP-001', 'Rahul Sharma', 'Quality Head', '+919876543210', '+919876543210', 'rahul@techcorp.com', 'TRUE'],
      ['2', 'COMP-002', 'Priya Singh', 'Purchase Manager', '+919123456789', '+919123456789', 'priya@globex.com', 'TRUE'],
      ['3', 'COMP-003', 'Amit Kumar', 'Director', '+919988776655', '+919988776655', 'amit@initech.com', 'TRUE'],
    ]
  },
  {
    name: 'Products',
    headers: ['product_id', 'machine_name', 'category', 'description', 'active'],
    rows: [
      ['1', 'SIPCON Projector Alpha', 'Projector', 'High precision optical profile projector', 'TRUE'],
      ['2', 'SIPCON Genie X', 'Genie', 'Automated vision measuring system', 'TRUE'],
      ['3', 'SIPCON Cable Analyzer', 'Cable', 'Cable measuring and analysis system', 'TRUE'],
    ]
  },
  {
    name: 'Purchases',
    headers: ['purchase_id', 'company_id', 'product_id', 'serial_no', 'purchase_date', 'warranty_expiry', 'amc_status'],
    rows: [
      ['1', 'COMP-001', '1', 'SP-2024-001', '2024-05-20', '2025-05-20', 'Active'],
      ['2', 'COMP-002', '2', 'GX-2024-002', '2024-08-15', '2025-08-15', 'Active'],
    ]
  },
  {
    name: 'Staff',
    headers: ['staff_id', 'full_name', 'designation', 'level', 'products_handled', 'phone', 'email', 'active'],
    rows: [
      ['1', 'Amit Patel', 'Service Engineer', '1', '1,2,3', '+919999999999', 'amit.patel@sipcon.com', 'TRUE'],
      ['2', 'Sunita Rao', 'Senior Engineer', '2', '1,2', '+918888888888', 'sunita.rao@sipcon.com', 'TRUE'],
    ]
  },
  {
    name: 'Tickets',
    headers: ['ticket_id', 'company_id', 'contact_id', 'product_id', 'query_text', 'status', 'priority', 'current_level', 'assigned_to', 'csat_rating', 'created_at', 'first_response_at', 'resolved_at', 'handled_successfully', 'reopened', 'notes'],
    rows: [
      ['SIP-2026-0001', 'COMP-001', '1', '1', 'The projector lens seems out of focus even after manual calibration.', 'Open', 'High', '1', '1', '', '2026-06-16T09:00:00Z', '', '', 'FALSE', 'FALSE', 'Requires immediate attention as it is blocking production.'],
      ['SIP-2026-0002', 'COMP-002', '2', '2', 'Need software update for Genie X.', 'Resolved', 'Low', '1', '1', '5', '2026-06-15T11:00:00Z', '2026-06-15T11:30:00Z', '2026-06-15T14:00:00Z', 'TRUE', 'FALSE', 'Update link provided. Customer installed successfully.'],
    ]
  },
  {
    name: 'Leads',
    headers: ['lead_id', 'name', 'company_name', 'whatsapp_number', 'machine_interest', 'converted', 'created_at'],
    rows: [
      ['1', 'Vikram Singh', 'Modern Auto Parts', '+918888888888', 'Cable Measuring System', 'FALSE', '2026-06-16T08:15:00Z'],
      ['2', 'Neha Gupta', 'FastPrint Ltd', '+917777777777', 'SIPCON Projector Alpha', 'FALSE', '2026-06-16T09:30:00Z'],
    ]
  },
  {
    name: 'CallLogs',
    headers: ['log_id', 'ticket_id', 'level', 'staff_called', 'call_status', 'timestamp', 'outcome'],
    rows: [
      ['1', 'SIP-2026-0001', '1', '1', 'Answered', '2026-06-16T09:15:00Z', 'Discussed issue, staff will visit site.'],
      ['2', 'SIP-2026-0002', '1', '1', 'Answered', '2026-06-15T11:30:00Z', 'Provided update link.'],
    ]
  },
];

// ─── Main Setup ───────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`\n❌ credentials.json not found at: ${KEY_PATH}`);
    console.error('Please download your Google Service Account JSON key and save it as credentials.json in the backend folder.');
    process.exit(1);
  }

  console.log('🔑 Authenticating with Google Sheets API...');
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  // Get existing sheet info
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTabs = sheetMeta.data.sheets.map((s) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }));
  console.log(`\n📋 Found existing tabs: ${existingTabs.map((t) => t.title).join(', ')}`);

  // Process each tab
  for (const tab of TABS) {
    const existing = existingTabs.find((t) => t.title === tab.name);

    if (!existing) {
      // Create new tab
      console.log(`\n➕ Creating tab: ${tab.name}`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tab.name } } }],
        },
      });
    } else {
      console.log(`\n✏️  Updating tab: ${tab.name} (already exists)`);
    }

    // Clear and write all data (headers + rows)
    const allData = [tab.headers, ...tab.rows];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab.name}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: allData },
    });

    console.log(`   ✅ Written ${tab.rows.length} rows to "${tab.name}"`);
  }

  // Now get GIDs for all tabs so we can print the .env config
  const updatedMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const allTabs = updatedMeta.data.sheets.map((s) => ({
    title: s.properties.title,
    gid: s.properties.sheetId,
  }));

  const tabMap = {
    Companies: 'GID_COMPANIES',
    Contacts: 'GID_CONTACTS',
    Products: 'GID_PRODUCTS',
    Purchases: 'GID_PURCHASES',
    Staff: 'GID_STAFF',
    Tickets: 'GID_TICKETS',
    Leads: 'GID_LEADS',
    CallLogs: 'GID_CALL_LOGS',
  };

  console.log('\n\n🎉 Setup complete! Copy these values to your .env file:\n');
  console.log('─'.repeat(50));
  for (const [tabName, envKey] of Object.entries(tabMap)) {
    const found = allTabs.find((t) => t.title === tabName);
    if (found) console.log(`${envKey}=${found.gid}`);
  }
  console.log('─'.repeat(50));

  // Auto-write to .env file
  let envContent = fs.readFileSync('.env', 'utf-8');
  for (const [tabName, envKey] of Object.entries(tabMap)) {
    const found = allTabs.find((t) => t.title === tabName);
    if (found) {
      // Replace or append the GID value
      const regex = new RegExp(`^${envKey}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${envKey}=${found.gid}`);
      } else {
        envContent += `\n${envKey}=${found.gid}`;
      }
    }
  }
  fs.writeFileSync('.env', envContent);
  console.log('\n✅ .env file updated automatically with all GIDs!');
  console.log('🚀 Restart the backend server to apply changes: npm run dev\n');
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err.message);
  process.exit(1);
});
