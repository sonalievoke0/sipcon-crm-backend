require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { readSheet, appendToSheet, updateRowInSheet } = require('./sheetsClient');

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.API_KEY || 'sipcon_secure_key_123';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SIPCON CRM API running', timestamp: new Date().toISOString() });
});

// API Key authentication
app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  next();
});

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── COMPANIES (gid=0) ───────────────────────────────────────────────────────
// Sheet cols: Company ID, Company Name, Industry, Website, Support Tier, Account Manager, Created Date, Status
app.get('/api/companies', asyncHandler(async (req, res) => {
  const data = await readSheet('companies');
  const mapped = data.map((r, i) => ({
    company_id:     r.company_id   || r.id             || String(i + 1),
    company_name:   r.company_name || r.name           || '',
    industry:       r.industry     || '',
    city:           r.city         || r.location       || '',
    address:        r.address      || r.website        || '',
    website:        r.website      || '',
    gst_or_reg_no:  r.gst_or_reg_no || r.gst_no       || '',
    source:         r.source        || r.support_tier  || '',
    account_manager: r.account_manager || '',
    created_at:     r.created_at   || r.created_date   || '',
    status:         r.status       || 'Active',
    ...r,
  }));
  res.json(mapped);
}));

app.post('/api/companies', asyncHandler(async (req, res) => {
  const record = { ...req.body };
  if (!record.company_id) record.company_id = `COMP-${Date.now()}`;
  if (!record.created_at) record.created_at = new Date().toISOString();
  try { await appendToSheet('Companies', record); } catch (e) { console.warn('[companies POST]', e.message); }
  res.status(201).json(record);
}));

app.put('/api/companies/:id', asyncHandler(async (req, res) => {
  try {
    const updated = await updateRowInSheet('Companies', 'company_id', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Company not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

// ─── CONTACTS (gid=843284378) ─────────────────────────────────────────────────
// Sheet cols: Contact ID, First Name, Last Name, Email, Phone, Company ID, Role, Status
app.get('/api/contacts', asyncHandler(async (req, res) => {
  const data = await readSheet('contacts');
  const mapped = data.map((r, i) => ({
    contact_id:      r.contact_id    || r.id           || String(i + 1),
    company_id:      r.company_id    || '',
    full_name:       r.full_name     || `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    first_name:      r.first_name    || '',
    last_name:       r.last_name     || '',
    designation:     r.designation   || r.role        || '',
    email:           r.email         || '',
    whatsapp_number: r.whatsapp_number || r.phone     || '',
    callback_number: r.callback_number || r.phone     || '',
    phone:           r.phone         || '',
    is_primary:      r.is_primary    || 'TRUE',
    status:          r.status        || 'Active',
    ...r,
  }));
  res.json(mapped);
}));

app.post('/api/contacts', asyncHandler(async (req, res) => {
  const record = { ...req.body };
  if (!record.contact_id) record.contact_id = `CONT-${Date.now()}`;
  try { await appendToSheet('Contacts', record); } catch (e) { console.warn('[contacts POST]', e.message); }
  res.status(201).json(record);
}));

app.put('/api/contacts/:id', asyncHandler(async (req, res) => {
  try {
    const updated = await updateRowInSheet('Contacts', 'contact_id', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Contact not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

// ─── PRODUCTS (gid=1884386573) ────────────────────────────────────────────────
// Sheet cols: Product ID, Product Name, Category, Unit Price, Status
app.get('/api/products', asyncHandler(async (req, res) => {
  const data = await readSheet('products');
  const mapped = data.map((r, i) => ({
    product_id:    r.product_id   || r.id           || String(i + 1),
    machine_name:  r.machine_name || r.product_name || r.name || '',
    product_name:  r.product_name || r.machine_name || '',
    category:      r.category     || '',
    description:   r.description  || '',
    unit_price:    r.unit_price   || '',
    active:        r.active !== undefined ? r.active : (r.status === 'Active' ? 'TRUE' : 'FALSE'),
    status:        r.status       || 'Active',
    ...r,
  }));
  res.json(mapped);
}));

app.post('/api/products', asyncHandler(async (req, res) => {
  const record = { ...req.body };
  if (!record.product_id) record.product_id = `PROD-${Date.now()}`;
  try { await appendToSheet('Products', record); } catch (e) { console.warn('[products POST]', e.message); }
  res.status(201).json(record);
}));

app.put('/api/products/:id', asyncHandler(async (req, res) => {
  try {
    const updated = await updateRowInSheet('Products', 'product_id', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

// ─── PURCHASES (gid=1445510632) ───────────────────────────────────────────────
// Sheet cols: Purchase ID, Company ID, Product ID, Purchase Date, Quantity, Total Amount, License Key
app.get('/api/purchases', asyncHandler(async (req, res) => {
  const data = await readSheet('purchases');
  const mapped = data.map((r, i) => ({
    purchase_id:    r.purchase_id   || r.id            || String(i + 1),
    company_id:     r.company_id    || '',
    product_id:     r.product_id    || '',
    serial_no:      r.serial_no     || r.license_key   || '',
    purchase_date:  r.purchase_date || '',
    warranty_expiry: r.warranty_expiry || '',
    quantity:       r.quantity      || '',
    total_amount:   r.total_amount  || '',
    amc_status:     r.amc_status    || 'Active',
    ...r,
  }));
  res.json(mapped);
}));

app.post('/api/purchases', asyncHandler(async (req, res) => {
  const record = { ...req.body };
  if (!record.purchase_id) record.purchase_id = `PUR-${Date.now()}`;
  try { await appendToSheet('Purchases', record); } catch (e) { console.warn('[purchases POST]', e.message); }
  res.status(201).json(record);
}));

// ─── STAFF / AGENTS (gid=164464322) ──────────────────────────────────────────
// Sheet cols: Agent ID, First Name, Last Name, Email, Phone, Tier, Specialty, Status
app.get('/api/staff', asyncHandler(async (req, res) => {
  const data = await readSheet('staff');
  const mapped = data.map((r, i) => ({
    staff_id:         r.staff_id    || r.agent_id     || r.id || String(i + 1),
    agent_id:         r.agent_id    || r.staff_id     || '',
    full_name:        r.full_name   || `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    first_name:       r.first_name  || '',
    last_name:        r.last_name   || '',
    designation:      r.designation || r.tier         || r.specialty || '',
    tier:             r.tier        || '',
    specialty:        r.specialty   || '',
    level:            r.level       || (r.tier === 'Tier 1' ? '1' : r.tier === 'Tier 2' ? '2' : '3'),
    email:            r.email       || '',
    phone:            r.phone       || '',
    products_handled: r.products_handled || '',
    active:           r.active !== undefined ? r.active : (r.status === 'Active' ? 'TRUE' : 'FALSE'),
    status:           r.status      || 'Active',
    ...r,
  }));
  res.json(mapped);
}));

app.post('/api/staff', asyncHandler(async (req, res) => {
  const record = { ...req.body };
  if (!record.staff_id && !record.agent_id) record.agent_id = `AGT-${Date.now()}`;
  try { await appendToSheet('Staff', record); } catch (e) { console.warn('[staff POST]', e.message); }
  res.status(201).json(record);
}));

app.put('/api/staff/:id', asyncHandler(async (req, res) => {
  try {
    let updated = await updateRowInSheet('Staff', 'staff_id', req.params.id, req.body);
    if (!updated) updated = await updateRowInSheet('Staff', 'agent_id', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Staff not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

// ─── TICKETS (gid=831721573) ──────────────────────────────────────────────────
// Sheet cols: Ticket ID, Subject, Description, Status, Priority, Type, Created Date, Due Date, Closed Date, Company ID, Contact ID, Product ID, Assigned To, Resolution, Tags, Time Spent
app.get('/api/tickets', asyncHandler(async (req, res) => {
  const data = await readSheet('tickets');
  const mapped = data.map((r, i) => ({
    ticket_id:        r.ticket_id     || r.id             || String(i + 1),
    company_id:       r.company_id    || '',
    contact_id:       r.contact_id    || '',
    product_id:       r.product_id    || '',
    query_text:       r.query_text    || r.description    || r.subject || '',
    subject:          r.subject       || '',
    status:           r.status        || 'Open',
    priority:         r.priority      || 'Medium',
    type:             r.type          || '',
    current_level:    r.current_level || '1',
    assigned_to:      r.assigned_to   || '',
    csat_rating:      r.csat_rating   || '',
    created_at:       r.created_at    || r.created_date   || '',
    first_response_at: r.first_response_at || '',
    resolved_at:      r.resolved_at   || r.closed_date    || '',
    due_date:         r.due_date      || '',
    resolution:       r.resolution    || '',
    tags:             r.tags          || '',
    time_spent:       r.time_spent    || '',
    handled_successfully: r.handled_successfully || (r.status === 'Closed' ? 'TRUE' : 'FALSE'),
    reopened:         r.reopened      || 'FALSE',
    notes:            r.notes         || r.resolution     || '',
    ...r,
  }));
  res.json(mapped);
}));

app.post('/api/tickets', asyncHandler(async (req, res) => {
  const record = { ...req.body };
  if (!record.ticket_id) {
    const existing = await readSheet('tickets');
    const year = new Date().getFullYear();
    record.ticket_id = `SIP-${year}-${String(existing.length + 1).padStart(4, '0')}`;
  }
  if (!record.created_at) record.created_at = new Date().toISOString();
  try { await appendToSheet('Tickets', record); } catch (e) { console.warn('[tickets POST]', e.message); }
  res.status(201).json(record);
}));

app.put('/api/tickets/:id', asyncHandler(async (req, res) => {
  try {
    let updated = await updateRowInSheet('Tickets', 'ticket_id', req.params.id, req.body);
    if (!updated) updated = await updateRowInSheet('Tickets', 'id', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Ticket not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

// ─── CALL LOGS (gid=1575215762) ───────────────────────────────────────────────
// Sheet cols: Call ID, Ticket ID, Agent ID, Date, Duration (mins), Type, Notes
app.get('/api/call_logs', asyncHandler(async (req, res) => {
  const data = await readSheet('call_logs');
  const mapped = data.map((r, i) => ({
    log_id:        r.log_id    || r.call_id    || r.id   || String(i + 1),
    call_id:       r.call_id   || '',
    ticket_id:     r.ticket_id || '',
    level:         r.level     || '1',
    staff_called:  r.staff_called || r.agent_id || '',
    agent_id:      r.agent_id  || '',
    call_status:   r.call_status || r.type     || 'Answered',
    type:          r.type       || '',
    timestamp:     r.timestamp || r.date       || '',
    date:          r.date       || '',
    duration:      r.duration_mins || r.duration || '',
    outcome:       r.outcome    || r.notes     || '',
    notes:         r.notes      || '',
    ...r,
  }));
  res.json(mapped);
}));

app.post('/api/call_logs', asyncHandler(async (req, res) => {
  const record = { ...req.body };
  if (!record.log_id && !record.call_id) record.call_id = `CALL-${Date.now()}`;
  if (!record.timestamp) record.timestamp = new Date().toISOString();
  try { await appendToSheet('CallLogs', record); } catch (e) { console.warn('[call_logs POST]', e.message); }
  res.status(201).json(record);
}));

// ─── LEADS (gid=475662632) ────────────────────────────────────────────────────
// Sheet cols: Lead ID, Company Name, Contact Name, Email, Phone, Source, Status
app.get('/api/leads', asyncHandler(async (req, res) => {
  const data = await readSheet('leads');
  const mapped = data.map((r, i) => ({
    lead_id:          r.lead_id    || r.id            || String(i + 1),
    name:             r.name       || r.contact_name  || '',
    contact_name:     r.contact_name || r.name        || '',
    company_name:     r.company_name || '',
    email:            r.email      || '',
    whatsapp_number:  r.whatsapp_number || r.phone    || '',
    phone:            r.phone      || '',
    machine_interest: r.machine_interest || r.source  || '',
    source:           r.source     || '',
    converted:        r.converted  || (r.status === 'Converted' ? 'TRUE' : 'FALSE'),
    status:           r.status     || 'New',
    created_at:       r.created_at || '',
    ...r,
  }));
  res.json(mapped);
}));

app.post('/api/leads', asyncHandler(async (req, res) => {
  const record = { ...req.body };
  if (!record.lead_id) record.lead_id = `LEAD-${Date.now()}`;
  if (!record.created_at) record.created_at = new Date().toISOString();
  try { await appendToSheet('Leads', record); } catch (e) { console.warn('[leads POST]', e.message); }
  res.status(201).json(record);
}));

app.put('/api/leads/:id', asyncHandler(async (req, res) => {
  try {
    let updated = await updateRowInSheet('Leads', 'lead_id', req.params.id, req.body);
    if (!updated) updated = await updateRowInSheet('Leads', 'id', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Lead not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('API Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ SIPCON CRM Backend running on http://localhost:${PORT}`);
  console.log(`📊 Connected to Google Sheet: ${process.env.GOOGLE_SHEET_ID}`);
  console.log(`📋 Tabs loaded: Companies | Contacts | Products | Purchases | Staff | Tickets | CallLogs | Leads`);
});
