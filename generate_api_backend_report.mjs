import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs/promises';

const firebaseConfig = {
  apiKey: 'AIzaSyD1P02TRlTsPgNXKhUJ26OnXbCGSVJOFa8',
  authDomain: 'enarvapp.firebaseapp.com',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const BODY_BY_ROUTE = {
  'PATCH /admin/users/:id/status': { status: 'active' },
  'PATCH /admin/reports/:id': { status: 'resolved' },
  'POST /admin/notifications/send': {
    target_group: 'all',
    title: 'API test notification',
    body: 'Diagnostic run',
  },
  'POST /admin/settings': { key: 'referral_system_active', value: true },
  'POST /admin/kill-switch': { enabled: false },
  'POST /blogs': { title: 'API test blog', content: 'Diagnostic post', category: 'test' },
  'PATCH /blogs/:id': { title: 'Updated by diagnostic test' },
  'POST /deals': { bookId: 'test-id', discountPercent: 10, startsAt: new Date().toISOString() },
  'PATCH /support/admin/:id': { status: 'closed' },
  'POST /clubs': { name: 'API test club', description: 'Diagnostic club' },
  'PATCH /clubs/:id': { description: 'Updated from diagnostic script' },
  'PATCH /books/:id': { title: 'Updated title via diagnostics' },
  'POST /books': { title: 'Diagnostic Book', isbn: '9999999999', price_mrp: 10000 },
  'POST /admin/books/bulk': { books: [] },
  'PATCH /books/:id/stock': { offset: 1 },
  'POST /books/bulk-upload': { books: [] },
  'PATCH /orders/:id/status': { status: 'shipped' },
  'POST /wallet/admin/credit': { userId: 'test-user', amount: 1000, reason: 'diagnostic' },
  'POST /wallet/admin/deduct': { userId: 'test-user', amount: 1000, reason: 'diagnostic' },
  'PATCH /admin/users/:id/permissions': { permissions: ['manage_books'] },
  'PATCH /admin/users/:id/role': { role: 'admin' },
  'PATCH /admin/users/:id': { account_status: 'active' },
  'PATCH /clubs/:id/status': { status: 'active' },
  'PATCH /clubs/:id/posts/:postId/pin': { pinned: true },
  'PATCH /clubs/:id/posts/:postId/highlight': { highlighted: true },
};

function normalizeRoute(pathname) {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/test-post\b/g, '/:postId')
    .replace(/\/test-user\b/g, '/:userId')
    .replace(/\/test-club\b/g, '/:clubId')
    .replace(/\/test-id\b/g, '/:id');
}

function extractPathParams(pathname) {
  const params = {};
  const parts = pathname.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === 'test-id') params.id = 'test-id';
    if (part === 'test-post') params.postId = 'test-post';
    if (part === 'test-user') params.userId = 'test-user';
    if (part === 'test-club') params.clubId = 'test-club';
  }
  return params;
}

function classify(status, message) {
  if (status === 200 || status === 204) return 'OK';
  if (status === 'ERROR') return 'Client timeout/network';
  if (status === 400) return 'Validation/input issue';
  if (status === 401 || status === 403) return 'Auth/permission issue';
  if (status === 404 && /Cannot\s+(GET|POST|PATCH|DELETE)\s+/i.test(message)) return 'Route not implemented';
  if (status === 404) return 'Resource not found';
  if (status >= 500) return 'Backend internal/server issue';
  return 'Other';
}

function whyText(classification, message) {
  if (classification === 'Validation/input issue') return 'Payload/params do not satisfy backend schema.';
  if (classification === 'Auth/permission issue') return 'Token user lacks required role/permissions for this endpoint.';
  if (classification === 'Route not implemented') return 'Backend router does not expose this method/path.';
  if (classification === 'Resource not found') return 'Referenced entity ID/slug does not exist.';
  if (classification === 'Backend internal/server issue') {
    return `Server-side failure. Backend message: ${message || 'none'}`;
  }
  if (classification === 'Client timeout/network') return 'No response before timeout; endpoint may hang or be slow.';
  return 'See backend message.';
}

function isExpectedNotFound(row) {
  if (row.classification !== 'Resource not found') return false;
  const pathParamValues = Object.values(row.pathParams || {});
  const usesKnownDummy = pathParamValues.some((v) => ['test-id', 'test-post', 'test-user', 'test-club'].includes(v));
  if (usesKnownDummy) return true;
  if (row.path.includes('/test-id') || row.path.includes('/test-post') || row.path.includes('/test-user') || row.path.includes('/test-club')) {
    return true;
  }
  return false;
}

async function main() {
  const creds = await signInWithEmailAndPassword(auth, 'aryansakaria1@gmail.com', 'password');
  const token = await creds.user.getIdToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const sweepFile = await fs.readFile('api_sweep_status_now.tsv', 'utf-8');
  const lines = sweepFile.split('\n').filter((line) => line.trim().length > 0);
  const rows = [];

  for (const line of lines) {
    const [method, fullPath] = line.split('\t');
    if (!method || !fullPath) continue;

    const urlObj = new URL(`https://api.enarv.com${fullPath}`);
    const pathname = urlObj.pathname;
    const queryParams = Object.fromEntries(urlObj.searchParams.entries());
    const routeKey = `${method} ${normalizeRoute(pathname)}`;
    const body = BODY_BY_ROUTE[routeKey] || null;

    let status;
    let backendMessage = '';
    try {
      const response = await fetch(urlObj.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
        signal: AbortSignal.timeout(7000),
      });
      status = response.status;
      const text = await response.text();
      backendMessage = text;
      try {
        const parsed = JSON.parse(text);
        if (parsed.message) backendMessage = parsed.message;
        else if (parsed.error) backendMessage = parsed.error;
        else if (Array.isArray(parsed.errors) && parsed.errors.length > 0) backendMessage = parsed.errors.join('; ');
        else backendMessage = JSON.stringify(parsed);
      } catch {
        // Keep raw non-JSON response as backendMessage.
      }
    } catch (error) {
      status = 'ERROR';
      backendMessage = error.message;
    }

    const classification = classify(status, backendMessage);
    const why = whyText(classification, backendMessage);
    rows.push({
      method,
      path: pathname,
      queryParams,
      pathParams: extractPathParams(pathname),
      bodySent: body,
      status,
      backendMessage: String(backendMessage || '').replace(/\s+/g, ' ').trim(),
      classification,
      why,
    });
  }

  const failing = rows.filter((r) => !(r.status === 200 || r.status === 204));
  const actionable = failing.filter((r) => !isExpectedNotFound(r));

  const markdown = [
    '# API Diagnostics For Backend',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Total endpoints tested: ${rows.length}`,
    `Failing endpoints: ${failing.length}`,
    '',
    '| Method | Path | Status | Path Params | Query Params | Body Sent | Backend Message | Classification | Why Happening |',
    '|---|---|---:|---|---|---|---|---|---|',
    ...failing.map((r) => {
      const pathParams = Object.keys(r.pathParams).length ? JSON.stringify(r.pathParams) : '-';
      const queryParams = Object.keys(r.queryParams).length ? JSON.stringify(r.queryParams) : '-';
      const bodySent = r.bodySent ? JSON.stringify(r.bodySent) : '-';
      const msg = (r.backendMessage || '-').replace(/\|/g, '\\|');
      const why = r.why.replace(/\|/g, '\\|');
      return `| ${r.method} | ${r.path} | ${r.status} | ${pathParams} | ${queryParams} | ${bodySent} | ${msg} | ${r.classification} | ${why} |`;
    }),
    '',
  ].join('\n');

  const tsv = [
    'method\tpath\tstatus\tpath_params\tquery_params\tbody_sent\tbackend_message\tclassification\twhy_happening',
    ...rows.map((r) => [
      r.method,
      r.path,
      r.status,
      JSON.stringify(r.pathParams),
      JSON.stringify(r.queryParams),
      JSON.stringify(r.bodySent),
      (r.backendMessage || '').replace(/\t/g, ' ').replace(/\n/g, ' '),
      r.classification,
      r.why,
    ].join('\t')),
  ].join('\n');

  const actionableMarkdown = [
    '# Actionable Backend Issues',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Total endpoints tested: ${rows.length}`,
    `Failing endpoints: ${failing.length}`,
    `Actionable backend issues: ${actionable.length}`,
    '',
    '| Method | Path | Status | Path Params | Query Params | Body Sent | Backend Message | Classification | Why Happening |',
    '|---|---|---:|---|---|---|---|---|---|',
    ...actionable.map((r) => {
      const pathParams = Object.keys(r.pathParams).length ? JSON.stringify(r.pathParams) : '-';
      const queryParams = Object.keys(r.queryParams).length ? JSON.stringify(r.queryParams) : '-';
      const bodySent = r.bodySent ? JSON.stringify(r.bodySent) : '-';
      const msg = (r.backendMessage || '-').replace(/\|/g, '\\|');
      const why = r.why.replace(/\|/g, '\\|');
      return `| ${r.method} | ${r.path} | ${r.status} | ${pathParams} | ${queryParams} | ${bodySent} | ${msg} | ${r.classification} | ${why} |`;
    }),
    '',
  ].join('\n');

  const actionableTsv = [
    'method\tpath\tstatus\tpath_params\tquery_params\tbody_sent\tbackend_message\tclassification\twhy_happening',
    ...actionable.map((r) => [
      r.method,
      r.path,
      r.status,
      JSON.stringify(r.pathParams),
      JSON.stringify(r.queryParams),
      JSON.stringify(r.bodySent),
      (r.backendMessage || '').replace(/\t/g, ' ').replace(/\n/g, ' '),
      r.classification,
      r.why,
    ].join('\t')),
  ].join('\n');

  await fs.writeFile('api_backend_diagnostics.md', markdown);
  await fs.writeFile('api_backend_diagnostics.tsv', tsv);
  await fs.writeFile('api_backend_actionable_issues.md', actionableMarkdown);
  await fs.writeFile('api_backend_actionable_issues.tsv', actionableTsv);

  console.log(`Report generated: api_backend_diagnostics.md`);
  console.log(`Data generated: api_backend_diagnostics.tsv`);
  console.log(`Actionable report: api_backend_actionable_issues.md`);
  console.log(`Actionable data: api_backend_actionable_issues.tsv`);
  console.log(`Total ${rows.length} checked, ${failing.length} failing`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
