# SIPCON CRM Backend

Express.js backend that uses **Google Sheets as the database**.

## Setup Instructions

### 1. Install dependencies
```bash
cd "c:\Users\sonal\sipcon CRM\backend"
npm install
```

### 2. Set up Google Sheets Access (Service Account)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts** → Create Service Account
5. Download the JSON key file → save it as `credentials.json` in this `backend/` folder
6. Copy the service account **email** (looks like `xyz@project.iam.gserviceaccount.com`)
7. Open your Google Sheet → Share it with that service account email (give **Editor** access)

### 3. Configure Google Sheet tabs
Your Google Sheet must have these tabs (sheet names):
| Tab Name   | Purpose            |
|------------|--------------------|
| Companies  | Company records    |
| Contacts   | Contact records    |
| Products   | Product catalog    |
| Purchases  | Purchase records   |
| Staff      | Staff details      |
| Tickets    | Support tickets    |
| Leads      | Lead tracking      |
| CallLogs   | Call log history   |

Each tab's **first row** must be the column headers matching the field names used in the CRM.

### 4. Run the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:5000`

## API Endpoints
All requests need header: `x-api-key: sipcon_secure_key_123`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/companies | List all companies |
| POST | /api/companies | Add company |
| PUT | /api/companies/:id | Update company |
| GET | /api/contacts | List all contacts |
| POST | /api/contacts | Add contact |
| PUT | /api/contacts/:id | Update contact |
| GET | /api/tickets | List tickets |
| POST | /api/tickets | Create ticket |
| PUT | /api/tickets/:id | Update ticket |
| GET | /api/leads | List leads |
| POST | /api/leads | Add lead |
| GET | /api/products | List products |
| GET | /api/staff | List staff |
| GET | /api/call_logs | List call logs |
| GET | /api/health | Health check |
