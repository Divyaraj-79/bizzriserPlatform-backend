/**
 * BizzRiser Platform – DEEP Benchmark
 * Uses the EXACT routes the frontend actually calls, with real auth tokens.
 *
 * Route map (from backend controllers):
 *   auth      → version:1  → /api/v1/auth/login
 *   analytics → no version → /api/analytics/overview|campaigns|automations
 *   contacts  → no version → /api/contacts
 *   campaigns → no version → /api/campaigns
 *   messaging → version:1  → /api/v1/messaging/conversations
 *   whatsapp  → version:1  → /api/v1/whatsapp/accounts
 */

const BASE_V1  = 'https://bizzriserplatform-backend.onrender.com/api/v1';
const BASE_API = BASE_V1; // All routes use /api/v1 global prefix (set in main.ts)

const EMAIL    = 'divyarajmakwanabusiness@gmail.com';
const PASSWORD = 'BizzRiser@79';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function login() {
  const start = Date.now();
  const res = await fetch(`${BASE_V1}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const elapsed = Date.now() - start;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  const payload = data.data || data;
  return {
    token: payload.access_token || payload.accessToken || payload.token,
    loginMs: elapsed
  };
}

async function timed(label, url, token, runs = 3) {
  // 1 warm-up
  await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  const times = [];
  let lastStatus = 0;
  let lastBody = null;

  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const elapsed = Date.now() - start;
    lastStatus = res.status;
    times.push(elapsed);
    try { lastBody = await res.json(); } catch(_) {}
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const min = Math.min(...times);
  const max = Math.max(...times);
  return { label, avg, min, max, status: lastStatus, body: lastBody, times };
}

function grade(ms) {
  if (ms <= 300) return '🟢 FAST    ';
  if (ms <= 700) return '🟡 OK      ';
  if (ms <= 1500) return '🟠 SLOW    ';
  return '🔴 VERY SLOW';
}

function row(label, avg, min, max, status, note = '') {
  const l = label.substring(0, 52).padEnd(52);
  const a = `${avg}ms`.padEnd(8);
  const range = `[${min}-${max}ms]`.padEnd(14);
  const s = `HTTP ${status}`.padEnd(10);
  return `  ${l} ${grade(avg)} ${a} ${range} ${s} ${note}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(80));
  console.log('  BizzRiser Platform – DEEP API Benchmark (correct routes + real auth)');
  console.log('='.repeat(80));

  // ── Step 1: Login ───────────────────────────────────────────────────────────
  console.log('\n🔐 Logging in...');
  let token, loginMs;
  try {
    ({ token, loginMs } = await login());
    console.log(`   ✅ Login OK in ${loginMs}ms  (${grade(loginMs).trim()})`);
    console.log(`   🔑 Token: ${token ? token.substring(0, 30) + '...' : 'MISSING'}`);
  } catch (e) {
    console.error(`   ❌ ${e.message}`);
    process.exit(1);
  }

  // ── Step 2: Discover accounts ────────────────────────────────────────────────
  console.log('\n📦 Fetching WhatsApp accounts (GET /api/v1/whatsapp/accounts)...');
  let accountId = null;
  try {
    const res = await fetch(`${BASE_V1}/whatsapp/accounts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const accounts = Array.isArray(data) ? data : (data.data || []);
    console.log(`   HTTP ${res.status} – ${accounts.length} account(s) found`);
    if (accounts.length > 0) {
      accountId = accounts[0].id;
      console.log(`   Using accountId: ${accountId}`);
    } else {
      console.log(`   ⚠️  No WA accounts. Some endpoints may scope to org-wide data.`);
    }
  } catch (e) {
    console.log(`   ⚠️  ${e.message}`);
  }

  // ── Step 3: Build date range ─────────────────────────────────────────────────
  const now = new Date();
  const d30 = new Date(now - 30 * 24 * 3600 * 1000);
  const startDate = d30.toISOString().split('T')[0];
  const endDate   = now.toISOString().split('T')[0];
  const dateQS    = `startDate=${startDate}T00:00:00.000Z&endDate=${endDate}T23:59:59.999Z`;
  const acctQS    = accountId ? `&accountId=${accountId}` : '';

  console.log(`\n📅 Date range: ${startDate} → ${endDate}`);
  console.log('\n' + '─'.repeat(80));
  console.log('  Running 1 warm-up + 3 measured runs per endpoint...');
  console.log('─'.repeat(80));

  const results = [];
  const sections = [
    {
      name: '🏠 DASHBOARD PAGE',
      endpoints: [
        { label: 'GET /api/v1/whatsapp/accounts', url: `${BASE_V1}/whatsapp/accounts` },
        { label: 'GET /api/analytics/overview', url: `${BASE_API}/analytics/overview?${dateQS}${acctQS}` },
      ]
    },
    {
      name: '📊 ANALYTICS PAGE (3 sequential calls on load)',
      endpoints: [
        { label: 'GET /api/analytics/overview', url: `${BASE_API}/analytics/overview?${dateQS}${acctQS}` },
        { label: 'GET /api/analytics/campaigns', url: `${BASE_API}/analytics/campaigns?${dateQS}${acctQS}` },
        { label: 'GET /api/analytics/automations', url: `${BASE_API}/analytics/automations?${dateQS}${acctQS}` },
      ]
    },
    {
      name: '💬 CHAT PAGE',
      endpoints: [
        { label: 'GET /api/v1/messaging/conversations', url: `${BASE_V1}/messaging/conversations?page=1&limit=20` },
        { label: 'GET /api/v1/messaging/conversations?section=mine', url: `${BASE_V1}/messaging/conversations?section=mine&page=1&limit=20` },
      ]
    },
    {
      name: '👥 CONTACTS PAGE',
      endpoints: [
        { label: 'GET /api/contacts?page=1&limit=20', url: `${BASE_API}/contacts?page=1&limit=20` },
        { label: 'GET /api/contacts/tags', url: `${BASE_API}/contacts/tags` },
      ]
    },
    {
      name: '📣 BROADCASTS PAGE',
      endpoints: [
        { label: 'GET /api/campaigns?page=1&limit=20', url: `${BASE_API}/campaigns?page=1&limit=20` },
        { label: 'GET /api/v1/whatsapp/accounts (for account picker)', url: `${BASE_V1}/whatsapp/accounts` },
      ]
    },
    {
      name: '📋 MESSAGE TEMPLATES PAGE',
      endpoints: [
        ...(accountId
          ? [{ label: `GET /api/v1/whatsapp/accounts/${accountId}/templates`, url: `${BASE_V1}/whatsapp/accounts/${accountId}/templates` }]
          : [{ label: 'GET /api/v1/whatsapp/accounts (to get ID)', url: `${BASE_V1}/whatsapp/accounts` }]
        ),
      ]
    },
  ];

  for (const section of sections) {
    console.log(`\n${section.name}`);
    for (const ep of section.endpoints) {
      const r = await timed(ep.label, ep.url, token);
      results.push({ section: section.name.replace(/^[^ ]+ /, ''), ...r });
      console.log(row(r.label, r.avg, r.min, r.max, r.status,
        r.status >= 400 ? `⚠️ (${r.body?.message || 'error'})` : ''));
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('  SUMMARY');
  console.log('='.repeat(80));

  const authRow = { label: 'LOGIN (cold)', avg: loginMs, min: loginMs, max: loginMs, status: 200 };
  const allRows = [authRow, ...results];

  const slowOnes = allRows.filter(r => r.avg > 700);
  const okOnes   = allRows.filter(r => r.avg > 300 && r.avg <= 700);
  const fastOnes = allRows.filter(r => r.avg <= 300);

  console.log(`\n  🟢 FAST  (≤300ms):  ${fastOnes.length} endpoints`);
  fastOnes.forEach(r => console.log(`     • ${r.label} — ${r.avg}ms`));

  console.log(`\n  🟡 OK    (≤700ms):  ${okOnes.length} endpoints`);
  okOnes.forEach(r => console.log(`     • ${r.label} — ${r.avg}ms`));

  console.log(`\n  🔴 SLOW  (>700ms):  ${slowOnes.length} endpoints`);
  slowOnes.forEach(r => console.log(`     • ${r.label} — ${r.avg}ms`));

  const errors = results.filter(r => r.status >= 400);
  if (errors.length > 0) {
    console.log(`\n  ⛔ ERRORS (HTTP 4xx/5xx):`);
    errors.forEach(r => console.log(`     • ${r.label} → HTTP ${r.status}`));
  }

  const avgAll = Math.round(results.reduce((a, b) => a + b.avg, 0) / results.length);
  console.log(`\n  📈 Overall average: ${avgAll}ms  ${grade(avgAll)}`);
  console.log('='.repeat(80));

  // ── ANALYTICS PAGE: total sequential load time ───────────────────────────────
  const analyticsEndpoints = results.filter(r =>
    r.label.includes('/api/analytics/') &&
    (r.label.includes('overview') || r.label.includes('campaigns') || r.label.includes('automations'))
  );
  if (analyticsEndpoints.length === 3) {
    const totalAnalyticsSeq = analyticsEndpoints.reduce((a, b) => a + b.avg, 0);
    console.log(`\n  📊 Analytics page total sequential load: ${totalAnalyticsSeq}ms`);
    console.log(`     (overview ${analyticsEndpoints[0].avg}ms + campaigns ${analyticsEndpoints[1].avg}ms + automations ${analyticsEndpoints[2].avg}ms)`);
    if (totalAnalyticsSeq > 600) {
      console.log(`     ⚠️  These 3 calls run SEQUENTIALLY in the frontend — parallel would save time!`);
    }
  }
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
