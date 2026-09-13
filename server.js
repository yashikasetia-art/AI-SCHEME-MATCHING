require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('❌ Missing JWT_SECRET in .env — set one before starting the server.');
    process.exit(1);
}

app.use(cors());
app.use(express.json());

// Serve index.html (and any other static assets) from this same service,
// so what's on Render always matches what's in this repo.
app.use(express.static(path.join(__dirname)));

const API_KEY = process.env.DATA_GOV_API_KEY || '579b464db66ec23bdd000001c6f4fd19b4a24c0f6d8b9987d8be6f3f';

const DATASETS = {
    banks: process.env.RESOURCE_BANK_BRANCHES || '61762a66-1720-4930-8916-b323edd7c0b6',
    microfinance: process.env.RESOURCE_MICROFINANCE || '3b0139d3-b88d-473b-9d41-e970b13f3679',
    schemes: process.env.RESOURCE_SC_SCHEMES || '9ef84210-d63b-483c-a320-143336717549'
};

// =========================================================================
// AUTH HELPERS
// =========================================================================
function signToken(user) {
    return jwt.sign({ sub: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ status: 'error', message: 'Missing or invalid Authorization header' });
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
    }
}

function publicUser(row) {
    return { id: row.id, name: row.name, email: row.email, income: row.income };
}

// =========================================================================
// DEMO SEED DATA (for showcasing the app with data already populated)
// =========================================================================
const DEMO_EMAIL = 'demo@schemesaathi.in';
const DEMO_PASSWORD = 'Demo@1234';

function seedDemoData() {
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL);
    if (existing) return; // already seeded

    const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
    const info = db.prepare(
        'INSERT INTO users (name, email, password_hash, income) VALUES (?, ?, ?, ?)'
    ).run('Priya Sharma', DEMO_EMAIL, passwordHash, 180000);
    const userId = info.lastInsertRowid;

    const insertApp = db.prepare(`
        INSERT INTO applications (id, user_id, scheme_key, scheme_name, scheme_name_hi, project_cost, loan_amount, emi, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertApp.run(
        'APP-2026-1042', userId, 'micro', 'Micro Finance Scheme (MFS)', 'सूक्ष्म वित्त योजना (एमएफएस)',
        120000, 108000, '₹3,245 / quarter', 'statusApproved', '2026-08-02 10:15:00'
    );
    insertApp.run(
        'APP-2026-1077', userId, 'aajeevika', 'Aajeevika Micro-Finance (NBFC-MFI)', 'आजीविका सूक्ष्म वित्त (एनबीएफसी-एमएफआई)',
        95000, 85500, '₹8,930 / quarter', 'statusUnderReview', '2026-08-20 14:40:00'
    );
    insertApp.run(
        'APP-2026-1103', userId, 'education', 'Educational Loan Scheme (ELS)', 'शैक्षिक ऋण योजना (ईएलएस)',
        350000, 315000, '₹9,870 / quarter', 'statusSubmitted', '2026-09-05 09:05:00'
    );

    console.log(`🌱 Seeded demo account (${DEMO_EMAIL} / ${DEMO_PASSWORD}) with 3 sample applications.`);
}

seedDemoData();

// =========================================================================
// ROUTE: Login (registers automatically on first sign-in — matches the
// portal's single "Login / Register Account" form)
// =========================================================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { name, email, password, income } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'Email and password are required' });
        }

        const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (existing) {
            const valid = await bcrypt.compare(password, existing.password_hash);
            if (!valid) {
                return res.status(401).json({ status: 'error', message: 'Incorrect password' });
            }
            return res.status(200).json({
                status: 'success',
                mode: 'login',
                token: signToken(existing),
                user: publicUser(existing)
            });
        }

        if (!name) {
            return res.status(400).json({ status: 'error', message: 'Name is required to create an account' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const info = db.prepare(
            'INSERT INTO users (name, email, password_hash, income) VALUES (?, ?, ?, ?)'
        ).run(name, email, passwordHash, income || 0);

        const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

        return res.status(201).json({
            status: 'success',
            mode: 'register',
            token: signToken(created),
            user: publicUser(created)
        });
    } catch (error) {
        console.error('[Auth Error]', error.message);
        return res.status(500).json({ status: 'error', message: 'Authentication failed' });
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    return res.status(200).json({ status: 'success', user: publicUser(user) });
});

// =========================================================================
// ROUTE: Applications (SQL-backed, replaces the old in-memory array)
// =========================================================================
app.get('/api/applications', requireAuth, (req, res) => {
    const rows = db.prepare(
        'SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.sub);
    return res.status(200).json({ status: 'success', applications: rows });
});

app.post('/api/applications', requireAuth, (req, res) => {
    const { schemeKey, schemeName, schemeNameHi, projectCost, loanAmount, emi } = req.body || {};
    if (!schemeKey || !projectCost || !loanAmount) {
        return res.status(400).json({ status: 'error', message: 'Missing required application fields' });
    }

    const id = `APP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    db.prepare(`
        INSERT INTO applications (id, user_id, scheme_key, scheme_name, scheme_name_hi, project_cost, loan_amount, emi, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'statusSubmitted')
    `).run(id, req.user.sub, schemeKey, schemeName, schemeNameHi || schemeName, projectCost, loanAmount, emi);

    const created = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    return res.status(201).json({ status: 'success', application: created });
});

// =========================================================================
// Shared helper: call api.data.gov.in for a given resource, with real
// diagnostics instead of silently swallowing every failure.
// =========================================================================
async function fetchGovResource(resourceId, { limit = 10, offset = 0, filters = {} } = {}) {
    let targetUrl = `https://api.data.gov.in/resource/${resourceId}?api-key=${API_KEY}&format=json&limit=${limit}&offset=${offset}`;

    for (const [key, value] of Object.entries(filters)) {
        if (value) targetUrl += `&filters[${encodeURIComponent(key)}]=${encodeURIComponent(value)}`;
    }

    console.log(`[data.gov.in] GET ${targetUrl.replace(API_KEY, 'API_KEY_HIDDEN')}`);

    const response = await axios.get(targetUrl, {
        timeout: 8000, // data.gov.in can be slow; 4s was cutting real requests off early
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
        }
    });

    const records = response.data.records || [];
    console.log(`[data.gov.in] resource=${resourceId} → ${records.length} record(s), total=${response.data.total ?? 'n/a'}`);
    if (records.length > 0) {
        // Log the real field names so you can fix the frontend mapping to match
        console.log(`[data.gov.in] Sample record fields: ${Object.keys(records[0]).join(', ')}`);
    }

    return { records, raw: response.data };
}

// =========================================================================
// ROUTE 1: Live Data Endpoint
// ?dataset=banks|microfinance|schemes (default: banks)
// ?state=, ?district= etc. are forwarded as data.gov.in filters
// =========================================================================
app.get('/api/live-data', async (req, res) => {
    const datasetKey = req.query.dataset || 'banks';
    const resourceId = DATASETS[datasetKey] || DATASETS.banks;
    const limit = req.query.limit || 10;
    const offset = req.query.offset || 0;

    const { state, district, ...rest } = req.query;

    try {
        const { records } = await fetchGovResource(resourceId, {
            limit,
            offset,
            filters: { state, district }
        });

        return res.status(200).json({
            status: 'success',
            dataset: datasetKey,
            resourceId,
            records
        });

    } catch (error) {
        // THIS is the part that was hiding the real problem before — log it.
        const status = error.response?.status;
        const body = error.response?.data;
        console.error(`[data.gov.in ERROR] dataset=${datasetKey} resourceId=${resourceId}`);
        console.error(`  → status: ${status || 'no response (timeout/network)'}`);
        if (body) console.error(`  → body: ${JSON.stringify(body).slice(0, 500)}`);
        if (!status) console.error(`  → error message: ${error.message}`);

        // Still return 200 with fallback so the frontend doesn't break mid-demo,
        // but now the fallback is clearly labelled and the real cause is in the logs.
        return res.status(200).json({
            status: 'fallback',
            dataset: datasetKey,
            reason: status ? `data.gov.in returned HTTP ${status}` : `data.gov.in unreachable: ${error.message}`,
            records: [
                { agency: "Delhi SC/ST Finance Development Corp", latitude: 28.6139, longitude: 77.2090, status: "Eligible", npa: "1.2%", type: "SCA" },
                { agency: "Punjab National Bank - Central Branch", latitude: 28.6328, longitude: 77.2197, status: "Eligible", npa: "2.1%", type: "PSB" },
                { agency: "State Bank of India - Regional Micro Unit", latitude: 28.5494, longitude: 77.2001, status: "Eligible", npa: "0.8%", type: "PSB" }
            ]
        });
    }
});

// =========================================================================
// ROUTE 2: Dynamic Single Resource Proxy (any resource_id, any dataset)
// =========================================================================
app.get('/api/gov-data', async (req, res) => {
    const resourceId = req.query.resource_id || DATASETS.banks;
    const limit = req.query.limit || 20;
    const offset = req.query.offset || 0;

    try {
        const { records } = await fetchGovResource(resourceId, { limit, offset });
        return res.status(200).json({ status: 'success', resourceId, records });
    } catch (error) {
        const status = error.response?.status;
        console.error(`[data.gov.in ERROR] /api/gov-data resourceId=${resourceId} status=${status || error.message}`);
        return res.status(200).json({
            status: 'fallback',
            reason: status ? `data.gov.in returned HTTP ${status}` : `data.gov.in unreachable: ${error.message}`,
            records: []
        });
    }
});

// =========================================================================
// ROUTE 3: Debug endpoint — hit this in the browser to see EXACTLY what
// data.gov.in gives back for each configured dataset (raw, unmapped).
// Remove or protect this before a public production deploy.
// =========================================================================
app.get('/api/debug/gov-data', async (req, res) => {
    const results = {};
    for (const [key, resourceId] of Object.entries(DATASETS)) {
        try {
            const { raw } = await fetchGovResource(resourceId, { limit: 3 });
            results[key] = { resourceId, ok: true, sample: raw.records?.[0] || null, total: raw.total };
        } catch (error) {
            results[key] = {
                resourceId,
                ok: false,
                status: error.response?.status || null,
                message: error.response?.data?.message || error.message
            };
        }
    }

    // Sanity check against a well-known, always-populated public dataset
    // (agricultural mandi prices) — if THIS also comes back empty, the
    // problem is your key/network, not your resource IDs.
    try {
        const { raw } = await fetchGovResource('9ef84268-d588-465a-a308-a864a43d0070', { limit: 1 });
        results._sanityCheck = { ok: true, total: raw.total, sample: raw.records?.[0] || null };
    } catch (error) {
        results._sanityCheck = { ok: false, status: error.response?.status || null, message: error.message };
    }

    return res.status(200).json(results);
});

app.listen(PORT, () => {
    console.log(`🚀 NSFDC Backend Proxy running at http://localhost:${PORT}`);
});
