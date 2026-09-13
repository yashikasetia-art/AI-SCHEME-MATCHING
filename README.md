# Scheme Saathi (AI-SCHEME-MATCHING)

An AI- and voice-assisted portal that helps beneficiaries discover concessional government credit schemes (modeled on NSFDC — the National Scheduled Castes Finance & Development Corporation), estimate loan eligibility, calculate EMIs, and locate nearby partner bank branches on a map.

## Features

- **Scheme eligibility recommender** — matches a project category, cost, household income, and gender against a rule-based scheme table, applying an income cap and a concessional interest discount for female applicants.
- **EMI & moratorium calculator** — quarterly repayment schedule with adjustable tenure (1–12 years) and grace period.
- **Voice interface** — speak your profile in and have recommendations read back, via the browser's Web Speech API.
- **Multilingual UI** — English / Hindi toggle.
- **Live partner map** — Leaflet.js map of nearby bank and microfinance branches, with geolocation and distance calculation.
- **Real accounts & applications** — SQLite-backed signup/login (bcrypt-hashed passwords, JWT sessions) and persisted loan applications, replacing the earlier in-memory/"simulated" backend.
- **Government data proxy** — server-side proxy to [data.gov.in](https://data.gov.in) with graceful fallback data if the upstream API is unreachable.

## Tech stack

| Layer    | Technology |
|----------|------------|
| Frontend | Vanilla JS, single `index.html`, Tailwind CSS (CDN), Leaflet.js |
| Backend  | Node.js, Express |
| Database | SQLite (via `better-sqlite3`) |
| Auth     | bcrypt password hashing + JWT sessions |
| External API | data.gov.in Open Government Data API |

## Project structure

```
.
├── index.html          # Entire frontend: UI, styles, and client-side logic
├── server.js            # Express API: auth, applications, gov-data proxy
├── db.js                 # SQLite connection + schema (users, applications)
├── package.json, package lock.json
├── .env.example          # Template for required environment variables
└── .gitignore
```

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your own values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PORT` | Port the Express server listens on (default `3000`) |
| `DATA_GOV_API_KEY` | Your API key from [data.gov.in](https://data.gov.in) |
| `RESOURCE_BANK_BRANCHES` | data.gov.in resource ID for bank branch data |
| `RESOURCE_MICROFINANCE` | data.gov.in resource ID for microfinance data |
| `RESOURCE_SC_SCHEMES` | data.gov.in resource ID for scheme data |
| `JWT_SECRET` | Long random string used to sign login sessions — **generate your own**, don't reuse an example value |

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Run the backend

```bash
npm start
```

This starts the API at `http://localhost:3000` and creates `data.db` (SQLite) on first run. On first startup, a demo account is automatically seeded with 3 sample loan applications (submitted, under review, and approved) so the app has real data to show right away — see [Demo account](#demo-account) below.

### 4. Open the frontend

Open `index.html` directly in a browser, or serve it with any static file server. It talks to the backend at `http://localhost:3000` (see `API_BASE` in `index.html` if you need to point it elsewhere).

## Demo account

For quick demos (e.g. showcasing to judges) without creating a fresh account, the backend seeds one on first run:

| Field | Value |
|-------|-------|
| Email | `demo@schemesaathi.in` |
| Password | `Demo@1234` |
| Name | Priya Sharma |
| Sample applications | 3 — one each in *Submitted*, *Under Review*, and *Approved & Disbursed* status, across the Micro Finance, Aajeevika, and Educational Loan schemes |

Click **"View Demo Account"** in the header to log in as this user with one click and see the populated applications table, or log in manually with the credentials above. This account is only created once — deleting its row from `data.db` (or deleting the file entirely) will cause it to be reseeded on the next server start.

## API reference

All endpoints are prefixed with the server's base URL (e.g. `http://localhost:3000`).

### Auth

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/auth/login` | — | Logs in an existing user, or auto-registers a new one if the email isn't found yet. Body: `{ name, email, password, income }` (`name`/`income` only required for a new account). Returns `{ token, user }`. |
| `GET`  | `/api/auth/me` | Bearer token | Returns the currently authenticated user. |

### Applications

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET`  | `/api/applications` | Bearer token | Lists the authenticated user's saved loan applications. |
| `POST` | `/api/applications` | Bearer token | Saves a new application. Body: `{ schemeKey, schemeName, schemeNameHi, projectCost, loanAmount, emi }`. |

Authenticated requests must include `Authorization: Bearer <token>`.

### Government data proxy

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/live-data?state=&limit=` | Bank branch data for the live-data widget, with fallback records if data.gov.in is unreachable. |
| `GET` | `/api/gov-data?resource_id=&limit=` | Generic proxy for any data.gov.in resource ID. |

## Security notes

- Passwords are hashed with bcrypt before storage — plaintext passwords are never saved.
- Sessions are stateless JWTs signed with `JWT_SECRET`; keep this value private and out of version control.
- `.env` and `data.db` are excluded via `.gitignore`. If a `.env` file or API key has ever been committed to this repo's history, rotate the key and scrub it from history (e.g. with `git filter-repo` or BFG Repo-Cleaner) before treating it as secure.

## License

ISC
