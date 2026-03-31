# CommisAI

MySQL-backed commission analytics app with a React + Vite frontend and an Express + TypeScript backend.

## Architecture Summary

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: MySQL (fully visible in MySQL Workbench)
- AI: Gemini API for natural-language commission insights
- Data flow: CSV/TSV upload -> frontend parser -> backend bulk API -> MySQL -> frontend API reads

## Stores and Entities

- invoices
- payments
- purchases
- vendors
- quotes
- fr_mapping
- quote_override
- commit_data
- item_list

## Migration Summary (IndexedDB to MySQL)

- Replaced frontend data layer in services/db.ts with REST API calls.
- Added backend service in backend/ with CRUD and bulk APIs.
- Added MySQL schema and verification SQL in backend/sql/.
- Added env examples for frontend and backend.
- Added root scripts for backend dev/build/start/schema init.

## Project Structure

```text
CommisAI/
├── App.tsx
├── components/
├── services/
│   ├── db.ts
│   └── gemini.ts
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── db.ts
│   │   ├── store-config.ts
│   │   ├── middleware/error.ts
│   │   ├── routes/entities.ts
│   │   └── scripts/init-db.ts
│   └── sql/
│       ├── schema.sql
│       └── verification.sql
├── .env.example
└── package.json
```

## API Endpoints

Base URL: `http://localhost:4000/api`

Health:

- GET /health

Per-entity (for each store above):

- GET /:entity?page=1&pageSize=100&q=search&sortBy=id|created_at|updated_at&sortOrder=asc|desc
- GET /:entity/:id
- POST /:entity
- PUT /:entity/:id
- DELETE /:entity/:id
- DELETE /:entity
- POST /:entity/bulk-add with { records: [...] }
- POST /:entity/bulk-upsert with { records: [...], keyField?: string }

Notes:

- quotes defaults upsert key to quote_number.
- bulk operations use transactions.
- all SQL uses parameterized values.

## Environment Variables

### Frontend (.env or .env.local)

Use .env.example as template.

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_API_KEY=your_gemini_api_key
```

### Backend (backend/.env)

Use backend/.env.example as template.

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=commisai
PORT=4000
CORS_ORIGIN=http://localhost:5173
```

## Setup and Run (End-to-End)

- Install frontend dependencies.

```bash
npm install
```

- Install backend dependencies.

```bash
npm --prefix backend install
```

- Ensure MySQL is running.
- Create database if needed.

```sql
CREATE DATABASE IF NOT EXISTS commisai;
```

- Copy backend/.env.example to backend/.env and fill values.
- Initialize schema.

```bash
npm run backend:db:init
```

- Start backend.

```bash
npm run backend:dev
```

- Copy .env.example to .env.local and fill values.
- Start frontend.

```bash
npm run dev
```

- Upload CSV/TSV from UI and confirm data in MySQL Workbench.

## MySQL Workbench Checklist

- Connect to the same MySQL instance configured in backend/.env.
- Open schema commisai.
- Confirm tables exist for all entities.
- Upload data from the app.
- Refresh table data in Workbench.
- Run verification queries from backend/sql/verification.sql.
- Confirm new rows appear after each upload.

## Verification Queries

Run backend/sql/verification.sql in MySQL Workbench. It includes:

- row counts per table
- latest rows per core tables
- sample joins for invoice/payment and invoice/purchase analysis

## Security and Safety

- Env validation with Zod.
- CORS and Helmet enabled.
- Centralized JSON error handling.
- Parameterized query values.
- Strict whitelist for entity names.

## NPM Scripts

Root scripts:

- npm run dev
- npm run build
- npm run lint
- npm run backend:dev
- npm run backend:build
- npm run backend:start
- npm run backend:db:init

Backend scripts:

- npm run dev
- npm run build
- npm run start
- npm run db:init

## Acceptance Criteria Mapping

- Upload from UI persists to MySQL: Yes.
- App reads from backend APIs (not IndexedDB): Yes.
- Existing core views remain functional: Yes.
