/**
 * sheetsClient.js
 * Reads Google Sheets data via the public CSV export URL.
 * No service account credentials required — the sheet must be set to
 * "Anyone with the link can view".
 *
 * For WRITE operations (append/update) you still need a service account,
 * but all READ operations work publicly.
 */

const https = require('https');
require('dotenv').config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Each entry maps a logical name → the ?gid= value from the sheet tab URL.
// To find a tab's GID: click the tab in Google Sheets → look at the URL → gid=XXXX
const SHEET_GIDS = {
  companies:  process.env.GID_COMPANIES || '0',
  contacts:   process.env.GID_CONTACTS  || '843284378',
  products:   process.env.GID_PRODUCTS  || '1884386573',
  purchases:  process.env.GID_PURCHASES || '1445510632',
  staff:      process.env.GID_STAFF     || '164464322',
  tickets:    process.env.GID_TICKETS   || '831721573',
  call_logs:  process.env.GID_CALL_LOGS || '1575215762',
  leads:      process.env.GID_LEADS     || '475662632',
};

/** Follow HTTP/HTTPS redirects and return response body as string */
function fetchURL(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : require('http');
    lib.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchURL(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** Parse a CSV string into an array of objects using the first row as keys */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];

  // Simple CSV parser that handles quoted fields
  function splitLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      // Normalize header: lowercase + underscores (e.g. "Company Name" → "company_name")
      const key = h.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
      obj[key] = values[i] !== undefined ? values[i] : '';
    });
    return obj;
  });
}

/**
 * Read a sheet tab by its logical name (e.g. 'companies').
 * Returns [] if the GID is not configured or fetch fails.
 */
async function readSheet(tabKey) {
  const gid = SHEET_GIDS[tabKey];
  if (!gid && gid !== '0') {
    // Not configured — return empty list silently
    return [];
  }
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  try {
    const csv = await fetchURL(url);
    // Check for HTML (sheet not public / wrong URL)
    if (csv.trim().startsWith('<!')) {
      console.warn(`[Sheets] Tab "${tabKey}" returned HTML — make sure the sheet is set to "Anyone with link can view".`);
      return [];
    }
    return parseCSV(csv);
  } catch (err) {
    console.error(`[Sheets] Failed to read tab "${tabKey}":`, err.message);
    return [];
  }
}

// ─── WRITE OPERATIONS (require credentials.json) ────────────────────────────
// These are optional. If credentials.json is missing they log a warning.

let _sheetsAPI = null;
async function getWriteClient() {
  if (_sheetsAPI) return _sheetsAPI;
  const fs = require('fs');
  const keyPath = require('path').resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      'credentials.json not found — write operations are disabled. ' +
      'See README.md for setup instructions.'
    );
  }
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  _sheetsAPI = google.sheets({ version: 'v4', auth: authClient });
  return _sheetsAPI;
}

async function appendToSheet(tabKey, rowData) {
  const sheets = await getWriteClient();
  const tabName = tabKey; // For writes we use tab name not GID
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!1:1`,
  });
  const headers = headerRes.data.values ? headerRes.data.values[0] : [];
  const row = headers.map((h) => {
    const key = h.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
    return rowData[key] !== undefined ? rowData[key] : (rowData[h] !== undefined ? rowData[h] : '');
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: tabName,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return rowData;
}

async function updateRowInSheet(tabKey, idColumn, idValue, updates) {
  const sheets = await getWriteClient();
  const tabName = tabKey;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tabName,
  });
  const rows = response.data.values;
  if (!rows || rows.length === 0) return null;
  const [headers] = rows;
  const dataRows = rows.slice(1);
  const normId = idColumn.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const idColIndex = headers.findIndex((h) => {
    const norm = h.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
    return norm === normId;
  });
  if (idColIndex === -1) throw new Error(`Column "${idColumn}" not found in ${tabName}`);
  const rowIndex = dataRows.findIndex((r) => String(r[idColIndex]) === String(idValue));
  if (rowIndex === -1) return null;
  const sheetRowNumber = rowIndex + 2;
  const existingRow = dataRows[rowIndex];
  const updatedRow = headers.map((h, i) => {
    const key = h.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
    return updates[key] !== undefined ? updates[key] : (existingRow[i] || '');
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A${sheetRowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [updatedRow] },
  });
  const result = {};
  headers.forEach((h, i) => {
    const key = h.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
    result[key] = updatedRow[i];
  });
  return result;
}

module.exports = { readSheet, appendToSheet, updateRowInSheet, SHEET_GIDS };
