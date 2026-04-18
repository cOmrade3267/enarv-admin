// API helper with JWT auth interceptor
//
// Modes (first match wins):
// 1) NEXT_PUBLIC_API_DIRECT=true — browser calls NEXT_PUBLIC_API_URL (or https://api.enarv.com) directly.
//    Network tab shows the real API host. Requires CORS on the API for your admin origin.
// 2) NEXT_PUBLIC_API_PROXY=true — browser calls /api/proxy/...; Next forwards to API_UPSTREAM_URL || NEXT_PUBLIC_API_URL.
// 3) Neither — same as direct: full origin from NEXT_PUBLIC_API_URL || https://api.enarv.com
//
function envTruthy(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function normalizeApiOrigin(url) {
  const u = String(url || '').trim().replace(/\/+$/, '');
  return u || 'https://api.enarv.com';
}

const DIRECT_API_BASE = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL);
const USE_DIRECT_API = envTruthy(process.env.NEXT_PUBLIC_API_DIRECT);
const USE_PROXY =
  !USE_DIRECT_API &&
  envTruthy(process.env.NEXT_PUBLIC_API_PROXY);

const API_BASE = USE_PROXY ? '/api/proxy' : DIRECT_API_BASE;

/**
 * Thrown by `api()` on non-OK responses. Lets UIs branch on `status` / `body`.
 */
export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Map known broken-deploy / opaque backend messages to actionable copy for admins.
 * Does not replace fixing the server; improves the panel when prod lags behind.
 */
export function humanizeBackendFailureMessage(status, rawMsg) {
  const s = String(rawMsg || '');
  const low = s.toLowerCase();

  if (low.includes('bookmodel is not defined')) {
    return 'Admin book delete is failing because the API process is missing a BookModel import (or an old build is deployed). Redeploy the backend that matches your repo.';
  }
  if (low.includes('settingsservice is not defined')) {
    return 'System settings endpoint is broken on the server (SettingsService not loaded). Redeploy the fixed adminController.';
  }
  if (low.includes('postmodel is not defined') || low.includes('usermodel is not defined')) {
    return 'This API build references a model that is not imported. Redeploy the backend.';
  }
  if (
    status === 500 &&
    (/\bpost\b.*\b(delet|remov)/i.test(s) ||
      /\b(delet|remov).*\bpost\b/i.test(s) ||
      low.includes('deleting post') ||
      low.includes('delete post'))
  ) {
    return 'Post delete failed on the server. Check API logs; common causes: missing PostModel import on deployed build, DB constraint (comments/likes), or admin delete handler bug.';
  }
  if (
    status === 500 &&
    (/\bbook\b.*\b(delet|remov)/i.test(s) ||
      /\b(delet|remov).*\bbook\b/i.test(s) ||
      low.includes('bookmodel') ||
      low.includes('delete book'))
  ) {
    return 'Book delete failed on the server. Check API logs; common causes: BookModel not wired in admin route, FK constraints (orders/inventory), or a bug in DELETE /admin/books/:id.';
  }
  if (
    status === 500 &&
    (low.includes('user deletion') || low.includes('deleting user')) &&
    (low.includes('internal server error') || low.includes('firebase'))
  ) {
    return 'User delete failed on the server. Use a real Firebase UID from this project; if the UID is valid, check Firebase Admin credentials and server logs.';
  }
  if (
    status === 500 &&
    (/\buser\b.*\b(delet|remov)/i.test(s) ||
      /\b(delet|remov).*\buser\b/i.test(s) ||
      low.includes('firebase-admin') ||
      (low.includes('firebase') && (low.includes('auth') || low.includes('credential'))))
  ) {
    return 'User delete failed on the server. Typical causes: Firebase Admin not configured on the API, wrong Firebase project for this UID, or the account still referenced by DB rows. Check API logs and Firebase service account.';
  }
  if (
    status === 500 &&
    (low.includes('foreign key') ||
      low.includes('violates') ||
      low.includes('constraint') ||
      low.includes('referential'))
  ) {
    return 'Delete failed: the database blocked it (related rows still reference this record). Backend may need cascade delete or cleanup of comments/likes first.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return `API temporarily unavailable (HTTP ${status}). Retry shortly or check upstream health.`;
  }
  return null;
}

/** Use in catch blocks: friendly text for ApiError and generic Errors. */
export function formatAdminApiError(err) {
  if (err == null) return 'Unknown error';
  if (err instanceof ApiError) return err.message;
  const m = err.message || String(err);
  const hint = humanizeBackendFailureMessage(null, m);
  return hint || m;
}

function unsupportedEndpoint(message) {
  throw new Error(message);
}

function getToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('admin_token');
  }
  return null;
}


export function setTokens(accessToken, refreshToken) {
  localStorage.setItem('admin_token', accessToken);
  if (refreshToken) localStorage.setItem('admin_refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_refresh_token');
  localStorage.removeItem('admin_user');
}

export function getAdminUser() {
  if (typeof window !== 'undefined') {
    const u = localStorage.getItem('admin_user');
    return u ? JSON.parse(u) : null;
  }
  return null;
}

export function setAdminUser(user) {
  localStorage.setItem('admin_user', JSON.stringify(user));
}

/**
 * @param {string} endpoint
 * @param {RequestInit & { soft401?: boolean }} options - soft401: if true, 401 throws without clearing session (for trying alternate URLs)
 */
export async function api(endpoint, options = {}) {
  const { soft401, headers: optHeaders, ...fetchRest } = options;

  // Auto-refresh Firebase token if user is logged in
  let token = getToken();
  if (typeof window !== 'undefined') {
    try {
      const { auth } = await import('./firebase');
      const currentUser = auth.currentUser;
      if (currentUser) {
        // getIdToken(false) returns cached token if still valid, refreshes if expired
        const freshToken = await currentUser.getIdToken(false);
        if (freshToken && freshToken !== token) {
          localStorage.setItem('admin_token', freshToken);
          token = freshToken;
        }
      }
    } catch (e) {
      // If Firebase refresh fails, continue with stored token
    }
  }

  const headers = { ...optHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const body = fetchRest.body;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body != null && body !== '' && !isFormData) {
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchRest,
    headers,
  });

  if (res.status === 401) {
    if (soft401) {
      throw new Error('HTTP 401');
    }
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let err = {};
    try {
      err = text ? JSON.parse(text) : {};
    } catch {
      err = {};
    }
    const routeMsg = text.includes('Cannot ') ? text.replace(/<[^>]*>/g, '').trim() : '';
    const joiErrors = Array.isArray(err.errors)
      ? err.errors.map((e) => (typeof e === 'string' ? e : e?.message || String(e))).join('; ')
      : '';
    const detail = err.error || err.details;
    const combined =
      err.message && detail && String(detail) !== String(err.message)
        ? `${err.message} (${detail})`
        : err.message || detail;
    const base = combined || joiErrors || routeMsg || `HTTP ${res.status}`;
    const hint = humanizeBackendFailureMessage(res.status, base);
    const message = hint ? `${hint} — ${base}` : base;
    throw new ApiError(message, { status: res.status, body: err });
  }

  if (res.status === 204 || res.status === 205) return null;

  const raw = await res.text().catch(() => '');
  if (!raw || !raw.trim()) return null;

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json') || /^[\s]*[{[]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/** Flatten nested order JSON ({ order: {...} }, { data: {...} }) for the admin UI. */
export function unwrapOrderPayload(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const inner =
    raw.order ||
    raw.data?.order ||
    (raw.data &&
    typeof raw.data === 'object' &&
    !Array.isArray(raw.data) &&
    (raw.data.items || raw.data.order_items || raw.data.line_items || raw.data.id || raw.data.order_id)
      ? raw.data
      : null) ||
    raw.result?.order ||
    (raw.result && typeof raw.result === 'object' && !Array.isArray(raw.result) ? raw.result : null) ||
    raw.payload?.order ||
    (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload) ? raw.payload : null);
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return { ...raw, ...inner };
  }
  return raw;
}

/** Parse ISO, unix seconds/ms, or Firestore-like { _seconds } / { seconds, nanoseconds }. */
export function coerceTimestamp(val) {
  if (val == null) return null;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    return val < 1e12 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return null;
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      return n < 1e12 ? n * 1000 : n;
    }
    const d = Date.parse(t);
    return Number.isNaN(d) ? null : d;
  }
  if (typeof val === 'object') {
    if (typeof val._seconds === 'number') {
      return val._seconds * 1000 + (typeof val._nanoseconds === 'number' ? val._nanoseconds / 1e6 : 0);
    }
    if (typeof val.seconds === 'number') {
      return val.seconds * 1000 + (typeof val.nanoseconds === 'number' ? val.nanoseconds / 1e6 : 0);
    }
  }
  return null;
}

/** Find first array that looks like order line items (nested anywhere). */
export function deepFindLineItemsArray(obj, depth = 0, seen = new Set()) {
  if (!obj || depth > 6) return null;
  if (typeof obj === 'object' && obj !== null) {
    if (seen.has(obj)) return null;
    seen.add(obj);
  }
  if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
    const keys = Object.keys(obj[0]).map((k) => k.toLowerCase());
    const hit = (sub) => keys.some((k) => k === sub || k.includes(sub));
    if (
      hit('book') ||
      hit('product') ||
      hit('title') ||
      hit('quantity') ||
      hit('qty') ||
      hit('sku') ||
      hit('amount')
    ) {
      return obj;
    }
  }
  if (typeof obj !== 'object' || obj === null) return null;
  for (const v of Object.values(obj)) {
    const r = deepFindLineItemsArray(v, depth + 1, seen);
    if (r) return r;
  }
  return null;
}

/** Find a displayable user string from nested username / name / email local-part. */
export function deepFindUserString(obj, depth = 0, seen = new Set()) {
  if (!obj || depth > 5) return null;
  if (typeof obj === 'object' && obj !== null) {
    if (seen.has(obj)) return null;
    seen.add(obj);
  }
  if (typeof obj !== 'object' || obj === null) return null;
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (typeof v === 'string' && v.trim() && v.length < 320) {
      if (kl === 'username' || kl === 'user_name' || kl === 'user') return v.trim();
      if (kl === 'email' && v.includes('@')) return v.trim().split('@')[0];
      if (
        kl === 'full_name' ||
        kl === 'fullname' ||
        kl === 'display_name' ||
        kl === 'customer_name' ||
        kl === 'buyer_name' ||
        kl === 'placed_by' ||
        kl === 'ordered_by'
      ) {
        return v.trim();
      }
      if (kl === 'name' && !/book|product|shipping|billing|item|genre|author|title|street|city|state/i.test(k))
        return v.trim();
    }
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'object' && v) {
      const r = deepFindUserString(v, depth + 1, seen);
      if (r) return r;
    }
  }
  return null;
}

/** Find a timestamp from nested created/date/time keys or Firestore objects. */
export function deepFindTimestamp(obj, depth = 0, seen = new Set()) {
  if (!obj || depth > 5) return null;
  if (typeof obj === 'object' && obj !== null) {
    if (seen.has(obj)) return null;
    seen.add(obj);
  }
  const direct = coerceTimestamp(obj);
  if (direct != null) return direct;
  if (typeof obj !== 'object' || obj === null) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (/^(created|updated|ordered|placed|inserted|time|date|timestamp|at)/i.test(k) || /_at$|date$|time$/i.test(k)) {
      const ts = coerceTimestamp(v);
      if (ts != null) return ts;
    }
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'object' && v) {
      const r = deepFindTimestamp(v, depth + 1, seen);
      if (r != null) return r;
    }
  }
  return null;
}

/** Heuristic: object is probably a book row from list/detail APIs. */
function looksLikeBookRow(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const hasName = Boolean((x.title && String(x.title).trim()) || (x.isbn && String(x.isbn).trim()));
  if (!hasName) return false;
  return (
    x.id != null ||
    x.book_id != null ||
    x._id != null ||
    x.price_mrp != null ||
    x.price_discount != null ||
    x.stock_quantity != null ||
    x.cover_url != null ||
    Array.isArray(x.authors)
  );
}

/**
 * When GET /books wraps the array (gateway, BFF, or unknown keys), find the best book[].
 */
function extractBooksArrayFromResponse(raw, depth = 0, seen = new Set()) {
  if (raw == null || depth > 10) return [];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    // Marketplace list is usually a plain array of { id, title, ... }
    if (
      raw.every(
        (x) =>
          x &&
          typeof x === 'object' &&
          !Array.isArray(x) &&
          typeof x.title === 'string' &&
          x.title.trim() !== ''
      )
    ) {
      return raw;
    }
    if (raw.every((x) => looksLikeBookRow(x))) return raw;
    const filtered = raw.filter(looksLikeBookRow);
    if (filtered.length > 0) return filtered;
    for (const el of raw.slice(0, 5)) {
      const inner = extractBooksArrayFromResponse(el, depth + 1, seen);
      if (inner.length > 0) return inner;
    }
    return [];
  }
  if (typeof raw !== 'object') return [];
  if (seen.has(raw)) return [];
  seen.add(raw);

  const keyOrder = [
    'books',
    'bookList',
    'book_list',
    'items',
    'results',
    'rows',
    'list',
    'records',
    'data',
    'result',
    'payload',
    'body',
    'content',
    'products',
  ];
  for (const k of keyOrder) {
    if (raw[k] != null) {
      const got = extractBooksArrayFromResponse(raw[k], depth + 1, seen);
      if (got.length > 0) return got;
    }
  }

  let best = [];
  for (const v of Object.values(raw)) {
    if (Array.isArray(v)) {
      const got = extractBooksArrayFromResponse(v, depth + 1, seen);
      if (got.length > best.length) best = got;
    } else if (v && typeof v === 'object') {
      const got = extractBooksArrayFromResponse(v, depth + 1, seen);
      if (got.length > best.length) best = got;
    }
  }
  return best;
}

/**
 * Books list query. Default: no query string — backend Joi applies limit=20, offset=0, sortBy=new.
 * Sending limit=100 caused HTTP 400 on some deployments (stricter validation than local max(100)).
 */
function buildBooksListQuery(params) {
  if (!params || !String(params).trim()) {
    return '';
  }
  const raw = String(params).replace(/^\?/, '');
  return `?${new URLSearchParams(raw).toString()}`;
}

/** Path param values to try for book mutations (UUID vs legacy ids). */
function bookIdentifierCandidates(idOrRow) {
  if (idOrRow == null) return [];
  if (typeof idOrRow === 'object' && idOrRow) {
    const o = idOrRow;
    const out = [];
    for (const k of ['id', 'book_id', 'bookId', '_id']) {
      const v = o[k];
      if (v != null && String(v).trim() !== '') out.push(String(v).trim());
    }
    return [...new Set(out)];
  }
  const s = String(idOrRow).trim();
  return s ? [s] : [];
}

/**
 * Enarv books — price contract (inferred from live GET + bulk/PATCH behavior):
 *
 * - **GET /books** (and list): `price_mrp` and `price_discount` are integer **paise** (e.g. 39900 = ₹399).
 * - **Writes** (`POST /admin/books/bulk`, `PATCH /admin/books/:id`): use the same shape:
 *   - `price_mrp`: **rupees** (e.g. 399). Server persists as paise.
 *   - `price_discount`: **paise** (MRP₹×100 − selling₹×100). Selling paise = MRP_paise − price_discount.
 *
 * Do not send MRP in paise on write (that double-converts with the server). Discount must be paise, not rupees.
 */

/**
 * Body for bulk add and the base for PATCH — one source of truth for numeric price fields.
 */
export function buildBookWritePayloadFromForm(form, mrpRs, priceRs) {
  const discountPaise = Math.max(0, Math.round((Number(mrpRs) - Number(priceRs)) * 100));
  return {
    isbn: form.isbn,
    title: form.title,
    cover_url: form.cover_image,
    description: form.description,
    genre: form.genre,
    language: form.language,
    price_mrp: Number(mrpRs),
    price_discount: discountPaise,
    stock_quantity: Math.max(0, Math.floor(Number(form.stock) || 0)),
    tags: form.tags,
    page_count: Math.max(0, Math.floor(Number(form.pages) || 0)),
  };
}

/**
 * PATCH maps JSON keys to DB columns — omit empty optionals and never send author fields
 * (authors are relational; `books` has no author column).
 */
export function sanitizeBookPatchBody(body) {
  const o = { ...body };
  for (const k of ['description', 'genre', 'tags']) {
    if (k in o && String(o[k] ?? '').trim() === '') delete o[k];
  }
  if (!String(o.isbn ?? '').trim()) delete o.isbn;
  if (!String(o.cover_url ?? '').trim()) delete o.cover_url;
  if (o.page_count === 0) delete o.page_count;
  return o;
}

/**
 * Convert a frontend book form/CSV row into the shape the backend bulk endpoint expects.
 * Backend requires: title (string, required), price_mrp (number, required).
 * On write: price_mrp is in rupees; price_discount is in paise (MRP − selling, ×100). Responses use paise for both.
 * Optional: isbn, cover_url, description, genre, language, page_count, stock_quantity, authors, tags, price_discount.
 */
function toAdminBulkBookEntry(data) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const entry = { title: data.title || '' };

  if (data.isbn) entry.isbn = String(data.isbn);
  if (data.cover_url || data.cover_image) entry.cover_url = data.cover_url || data.cover_image || '';
  if (data.description) entry.description = String(data.description);
  if (data.genre) entry.genre = String(data.genre);
  if (data.language) entry.language = String(data.language);
  if (data.tags) entry.tags = String(data.tags);

  if (data.price_mrp !== undefined) {
    entry.price_mrp = num(data.price_mrp);
  } else if (data.mrp !== undefined) {
    entry.price_mrp = num(data.mrp);
  } else {
    entry.price_mrp = 0;
  }

  if (data.price_discount !== undefined) {
    entry.price_discount = num(data.price_discount);
  } else if (data.price !== undefined && data.mrp !== undefined) {
    entry.price_discount = Math.max(0, Math.round((num(data.mrp) - num(data.price)) * 100));
  }

  if (data.stock_quantity !== undefined) entry.stock_quantity = num(data.stock_quantity);
  else if (data.stock !== undefined) entry.stock_quantity = num(data.stock);

  if (data.page_count !== undefined) entry.page_count = num(data.page_count);
  else if (data.total_pages !== undefined) entry.page_count = num(data.total_pages);
  else if (data.pages !== undefined) entry.page_count = num(data.pages);

  // Author: backend may expect authors array or author string
  if (data.author) entry.author_name = String(data.author);
  if (data.authors) entry.authors = data.authors;

  return entry;
}

function isBookMutationRetryable(err) {
  const st = err?.status;
  if (st >= 500 && st < 600) return true;
  const m = (err?.message || String(err || '')).toLowerCase();
  return (
    m.includes('404') ||
    m.includes('403') ||
    m.includes('401') ||
    m.includes('405') ||
    m.includes('cannot') ||
    m.includes('not found') ||
    m.includes('forbidden') ||
    m.includes('unauthorized') ||
    m.includes('http 404') ||
    m.includes('http 403') ||
    m.includes('http 401') ||
    m.includes('http 500')
  );
}

/** DELETE with encoded id, soft401 between attempts, multiple path bases per id. */
async function tryDeleteBookByPaths(idOrRow) {
  const ids = bookIdentifierCandidates(idOrRow);
  if (ids.length === 0) throw new Error('Book id required');

  const attempts = [];
  for (const rawId of ids) {
    const enc = encodeURIComponent(rawId);
    attempts.push(`/admin/books/${enc}`, `/api/admin/books/${enc}`, `/books/${enc}`);
  }

  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    const path = attempts[i];
    const isLast = i === attempts.length - 1;
    try {
      await api(path, { method: 'DELETE', soft401: !isLast });
      return;
    } catch (e) {
      lastErr = e;
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('409') || msg.includes('conflict')) throw e;
      if (isLast) throw e;
      if (!isBookMutationRetryable(e)) throw e;
    }
  }
  throw lastErr || new Error('Delete failed');
}

/** PATCH with same retry pattern as delete. */
async function tryPatchBookByPaths(idOrRow, bodyObj) {
  const ids = bookIdentifierCandidates(idOrRow);
  if (ids.length === 0) throw new Error('Book id required');
  const body = JSON.stringify(bodyObj);

  const attempts = [];
  for (const rawId of ids) {
    const enc = encodeURIComponent(rawId);
    attempts.push(`/admin/books/${enc}`, `/api/admin/books/${enc}`, `/books/${enc}`);
  }

  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    const path = attempts[i];
    const isLast = i === attempts.length - 1;
    try {
      return await api(path, { method: 'PATCH', body, soft401: !isLast });
    } catch (e) {
      lastErr = e;
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('409') || msg.includes('conflict')) throw e;
      if (isLast) throw e;
      if (!isBookMutationRetryable(e)) throw e;
    }
  }
  throw lastErr || new Error('Update failed');
}

/**
 * Merge common nested shapes (customer, snapshot, stringified JSON) so list/detail
 * responses map to the fields the admin table expects.
 */
export function prepareOrderForUi(raw) {
  let o = unwrapOrderPayload(raw);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o;

  const shallowMerge = (target, src) => {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return target;
    return { ...target, ...src };
  };

  for (const key of [
    'customer',
    'buyer',
    'member',
    'recipient',
    'account',
    'profile',
    'order_detail',
    'detail',
    'checkout',
    'metadata',
    'meta',
    'user_info',
    'userInfo',
    'user_details',
    'userDetails',
    'placed_by',
    'placedBy',
    'order_user',
    'orderUser',
    'subscriber',
    'shipping',
    'billing',
    'delivery',
    'payment',
    'payment_info',
    'paymentInfo',
    'receiver',
    'attributes',
    'extra',
    'raw',
    'record',
    'notes',
    'razorpay',
  ]) {
    o = shallowMerge(o, o[key]);
  }

  if (typeof o.snapshot === 'string') {
    try {
      o.snapshot = JSON.parse(o.snapshot);
    } catch {
      /* ignore */
    }
  }
  if (o.snapshot && typeof o.snapshot === 'object' && !Array.isArray(o.snapshot)) {
    o = shallowMerge(o, o.snapshot);
  }
  if (o.cart && typeof o.cart === 'object' && !Array.isArray(o.cart)) {
    o = shallowMerge(o, o.cart);
  }

  for (const key of ['items', 'cart', 'snapshot', 'metadata', 'meta', 'line_items', 'order_items']) {
    if (typeof o[key] === 'string') {
      try {
        const parsed = JSON.parse(o[key]);
        o[key] = parsed;
      } catch {
        /* ignore */
      }
    }
  }

  if (o.snapshot && typeof o.snapshot === 'object' && !Array.isArray(o.snapshot)) {
    o = shallowMerge(o, o.snapshot);
  }

  let items =
    o.items ||
    o.order_items ||
    o.line_items ||
    o.lineItems ||
    o.orderLines ||
    o.purchasedItems ||
    o.lines ||
    o.order_lines ||
    o.products ||
    o.books ||
    (o.cart && Array.isArray(o.cart.items) ? o.cart.items : null) ||
    (Array.isArray(o.cart_items) ? o.cart_items : null);

  if (!items && o.snapshot && typeof o.snapshot === 'object') {
    items =
      o.snapshot.items ||
      o.snapshot.line_items ||
      o.snapshot.lines ||
      (Array.isArray(o.snapshot) ? o.snapshot : null);
  }

  if (!Array.isArray(items)) items = [];

  if (items.length === 0) {
    const deepItems = deepFindLineItemsArray(o);
    if (deepItems) items = deepItems;
  }

  if (items.length === 0 && o.book_titles) {
    const arr = Array.isArray(o.book_titles)
      ? o.book_titles
      : String(o.book_titles)
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
    items = arr.map((title) => (typeof title === 'string' ? { title, quantity: 1, price_paid: 0 } : title));
  }
  if (items.length === 0 && typeof o.book_names === 'string' && o.book_names.trim()) {
    items = o.book_names
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title) => ({ title, quantity: 1, price_paid: 0 }));
  }
  if (items.length === 0 && Array.isArray(o.product_titles)) {
    items = o.product_titles.map((title) => ({ title: String(title), quantity: 1, price_paid: 0 }));
  }

  o.items = items;

  const uid =
    o.user_id ||
    o.userId ||
    o.customer_id ||
    o.customerId ||
    o.buyer_id ||
    o.buyerId ||
    o.member_id ||
    o.account_id ||
    o.purchaser_id ||
    o.owner_id ||
    o.user_uuid ||
    o.uid ||
    o.firebase_uid ||
    o.firebaseUid ||
    o.buyer_uid ||
    o.user_uid ||
    (o.user && typeof o.user === 'object' ? o.user.id || o.user.user_id || o.user.uuid || o.user.uid : null) ||
    (o.customer && typeof o.customer === 'object' ? o.customer.id || o.customer.user_id : null);

  if (uid) o.user_id = o.user_id || uid;

  const hint = deepFindUserString(o);
  if (hint && !o.username && !o.user_username && !o.user_email) {
    o.username = hint;
  }

  if (typeof o.user === 'string' && /^[0-9a-f-]{36}$/i.test(o.user.trim())) {
    o.user_id = o.user_id || o.user.trim();
  }

  o = unwrapOrderPayload(o);
  return o;
}

async function apiWithFallbacks(endpoints, options = {}) {
  const attempts = Array.isArray(endpoints) ? endpoints : [endpoints];
  let lastErr = null;
  for (const endpoint of attempts) {
    try {
      return await api(endpoint, options);
    } catch (err) {
      lastErr = err;
      const msg = (err?.message || '').toLowerCase();
      const canTryNext =
        msg.includes('cannot ') ||
        msg.includes('404') ||
        msg.includes('403') ||
        msg.includes('400') ||
        msg.includes('405') ||
        msg.includes('forbidden') ||
        msg.includes('not found') ||
        msg.includes('http 404') ||
        msg.includes('http 403') ||
        msg.includes('http 400') ||
        msg.includes('http 405');
      if (!canTryNext) throw err;
    }
  }
  throw lastErr || new Error('API request failed');
}

/** UUID / slug / internal id — try each for DELETE/PATCH /admin/clubs/:id. */
function clubIdentifierCandidates(c) {
  if (c == null) return [];
  if (typeof c === 'string' || typeof c === 'number') return [String(c)];
  if (typeof c !== 'object') return [];
  const out = [];
  for (const k of ['club_id', 'uuid', 'id', 'slug', 'clubId']) {
    const v = c[k];
    if (v != null && v !== '') out.push(String(v));
  }
  return [...new Set(out)];
}

/** Try DELETE or PATCH for each club id variant (UUID vs slug). */
async function tryClubEndpoints(idOrClub, pathSuffix, options) {
  const ids = clubIdentifierCandidates(idOrClub);
  if (ids.length === 0) throw new Error('Club id required');
  const isDelete = String(options?.method || '').toUpperCase() === 'DELETE';
  let lastErr;
  for (const id of ids) {
    const enc = encodeURIComponent(id);
    const suf = pathSuffix || '';
    const paths = [`/admin/clubs/${enc}${suf}`, `/api/admin/clubs/${enc}${suf}`];
    if (isDelete && !suf) paths.push(`/clubs/${enc}`);
    try {
      return await apiWithFallbacks(paths, options);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Club request failed');
}

/** Read moderation status from GET /admin/clubs/:id or GET /clubs/:slug detail payloads. */
function clubStatusFromDetail(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.is_suspended === true || d.suspended === true) return 'suspended';
  const raw = d.status ?? d.club_status ?? d.account_status ?? d.state;
  if (raw == null || raw === '') return null;
  const s = String(raw).toLowerCase();
  if (s === 'suspend' || s === 'suspended' || s === 'banned') return 'suspended';
  if (s === 'active' || s === 'published' || s === 'open') return 'active';
  return s;
}

/**
 * After PATCH suspend, re-fetch so we do not show success when only a no-op route returned 200
 * (e.g. PATCH /clubs/:id/status for a non-owner token).
 */
async function verifyClubSuspendedOnServer(idOrClub) {
  let readable = false;
  const ids = clubIdentifierCandidates(idOrClub);
  for (const rawId of ids) {
    const enc = encodeURIComponent(rawId);
    for (const path of [`/admin/clubs/${enc}`, `/clubs/${enc}`]) {
      try {
        const d = await api(path);
        const st = clubStatusFromDetail(d);
        if (st == null) continue;
        readable = true;
        return st === 'suspended';
      } catch {
        /* try next */
      }
    }
  }
  return !readable;
}

async function verifyClubActiveOnServer(idOrClub) {
  let readable = false;
  const ids = clubIdentifierCandidates(idOrClub);
  for (const rawId of ids) {
    const enc = encodeURIComponent(rawId);
    for (const path of [`/admin/clubs/${enc}`, `/clubs/${enc}`]) {
      try {
        const d = await api(path);
        const st = clubStatusFromDetail(d);
        if (st == null) continue;
        readable = true;
        return st !== 'suspended';
      } catch {
        /* try next */
      }
    }
  }
  return !readable;
}

/** Allow trying the next club route when the server rejects this shape (incl. HTML 404 / some 500s). */
function isClubMutationRetryable(err) {
  const st = err?.status;
  if (st === 404 || st === 405) return true;
  if (st === 400 || st === 403 || st === 401) return true;
  if (st >= 500 && st < 600) return true;
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('cannot ') ||
    msg.includes('not found') ||
    msg.includes('forbidden') ||
    msg.includes('unauthorized') ||
    msg.includes('http 404') ||
    msg.includes('http 403') ||
    msg.includes('http 400') ||
    msg.includes('http 405') ||
    msg.includes('http 500')
  );
}

/**
 * Suspend / activate — production may use PATCH .../status; local mock uses PATCH .../suspend.
 * Tries every club id candidate (uuid, slug, …) × multiple paths/bodies.
 */
async function tryClubSuspendOrActivate(idOrClub, mode) {
  const suspend = mode === 'suspend';
  const ids = clubIdentifierCandidates(idOrClub);
  if (ids.length === 0) throw new Error('Club id required');

  // Do not PATCH /clubs/:id/status here — it often returns 200 for admins without persisting club moderation state.
  const attemptsFor = (enc) => {
    if (suspend) {
      return [
        { url: `/admin/clubs/${enc}/status`, method: 'PATCH', body: { status: 'suspended' } },
        { url: `/admin/clubs/${enc}/status`, method: 'PATCH', body: { account_status: 'suspended' } },
        { url: `/admin/clubs/${enc}/suspend`, method: 'PATCH', body: {} },
        { url: `/admin/clubs/${enc}/suspend`, method: 'POST', body: {} },
        { url: `/api/admin/clubs/${enc}/suspend`, method: 'PATCH', body: {} },
        { url: `/api/admin/clubs/${enc}/suspend`, method: 'POST', body: {} },
      ];
    }
    return [
      { url: `/admin/clubs/${enc}/status`, method: 'PATCH', body: { status: 'active' } },
      { url: `/admin/clubs/${enc}/status`, method: 'PATCH', body: { account_status: 'active' } },
      { url: `/admin/clubs/${enc}/activate`, method: 'PATCH', body: {} },
      { url: `/admin/clubs/${enc}/activate`, method: 'POST', body: {} },
      { url: `/admin/clubs/${enc}/unsuspend`, method: 'PATCH', body: {} },
      { url: `/api/admin/clubs/${enc}/activate`, method: 'PATCH', body: {} },
    ];
  };

  let lastErr;
  for (const rawId of ids) {
    const enc = encodeURIComponent(rawId);
    for (const spec of attemptsFor(enc)) {
      try {
        const bodyJson = JSON.stringify(spec.body && typeof spec.body === 'object' ? spec.body : {});
        const res = await api(spec.url, { method: spec.method, body: bodyJson });
        const verified =
          suspend ? await verifyClubSuspendedOnServer(idOrClub) : await verifyClubActiveOnServer(idOrClub);
        if (verified) return res;
        lastErr = new ApiError(
          suspend
            ? 'Suspend request returned OK but the club is still active after re-fetch. Trying another admin route.'
            : 'Activate request returned OK but the club is still suspended after re-fetch. Trying another admin route.',
          { status: 502, body: {} },
        );
        if (!isClubMutationRetryable(lastErr)) throw lastErr;
      } catch (e) {
        lastErr = e;
        if (!isClubMutationRetryable(e)) throw e;
      }
    }
  }
  throw lastErr || new Error(suspend ? 'Suspend failed' : 'Activate failed');
}


import { auth } from './firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

export const adminApi = {
  // ═══════════════════════════════════════════════════
  // AUTH — POST /auth/register (not used), Firebase login
  // ═══════════════════════════════════════════════════
  login: async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();
      return { accessToken: token, email: userCredential.user.email, role: 'admin' };
    } catch {
      // Local/demo fallback for the bundled Express admin API.
      return api('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    }
  },

  // ═══════════════════════════════════════════════════
  // ADMIN — /admin/*
  // ═══════════════════════════════════════════════════
  // GET /admin/dashboard
  getDashboard: () =>
    apiWithFallbacks(['/admin/dashboard', '/api/admin/dashboard']),

  // GET /admin/users?q=&limit=50&offset=0
  getUsers: async (params = '') => {
    const res = await apiWithFallbacks([`/admin/users?${params}`, `/api/admin/users?${params}`]);
    const unwrap = (p) => {
      if (Array.isArray(p)) return p;
      if (!p || typeof p !== 'object') return [];
      return p.users || p.items || p.data?.users || p.data?.items || p.data || [];
    };
    return {
      users: unwrap(res),
      total: res?.total || res?.totalCount || res?.count || unwrap(res).length
    };
  },
  // PATCH /admin/users/{userId}/status
  updateUserStatus: (id, status) => {
    const e = encodeURIComponent(String(id));
    return api(`/admin/users/${e}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },
  // DELETE /admin/users/{userId} — userId must be Firebase UID for this project (backend uses Admin SDK)
  deleteUser: (id) => {
    const raw = String(id ?? '').trim();
    if (!raw) throw new ApiError('User id is required.', { status: 400, body: {} });
    // Loose check: avoid accidental username/email in URL (common mistake)
    if (raw.includes('@') || raw.includes(' ') || raw.length < 10) {
      throw new ApiError(
        'Delete uses Firebase user_id from the Users table, not email or username. Open the user row and use the id shown in the first column.',
        { status: 400, body: {} },
      );
    }
    const enc = encodeURIComponent(raw);
    return apiWithFallbacks([`/admin/users/${enc}`, `/api/admin/users/${enc}`], { method: 'DELETE' });
  },

  // GET /admin/reports
  getReports: async (params = '') => {
    const res = await apiWithFallbacks([`/admin/reports?${params}`, `/api/admin/reports?${params}`]);
    return Array.isArray(res) 
      ? res 
      : (res?.reports 
      || res?.items 
      || res?.data?.reports 
      || res?.result?.reports 
      || (Array.isArray(res?.data) ? res.data : null) 
      || (Array.isArray(res?.items) ? res.items : null) 
      || []);
  },
  // PATCH /admin/reports/{reportId} — UI uses "in-review"; backends often expect a single enum (no hyphen)
  updateReport: async (id, data) => {
    const idEnc = encodeURIComponent(String(id));
    const body = data && typeof data === 'object' ? { ...data } : {};
    const path = `/admin/reports/${idEnc}`;
    if (body.status === 'in-review') {
      const candidates = ['reviewing', 'in_review', 'pending', 'under_review', 'investigating'];
      let lastErr;
      for (const status of candidates) {
        try {
          return await api(path, { method: 'PATCH', body: JSON.stringify({ ...body, status }) });
        } catch (e) {
          lastErr = e;
          const m = (e?.message || String(e?.body?.message || '')).toLowerCase();
          const errs = Array.isArray(e?.body?.errors) ? e.body.errors.map(String).join(' ').toLowerCase() : '';
          const retry =
            m.includes('invalid status') ||
            (m.includes('invalid') && m.includes('status')) ||
            errs.includes('status');
          if (!retry) throw e;
        }
      }
      throw lastErr || new Error('Report status update failed');
    }
    return api(path, { method: 'PATCH', body: JSON.stringify(body) });
  },

  // POST /admin/notifications/send
  sendNotification: (data) => {
    // Backend expects targetGroup: 'all' | 'specific' | 'club'
    // Frontend dropdown may use 'specific_users' or 'club_members' — map them
    let targetGroup = data.targetGroup || data.targetType || 'all';
    if (targetGroup === 'specific_users') targetGroup = 'specific';
    if (targetGroup === 'club_members') targetGroup = 'club';
    const payload = {
      title: data.title,
      message: data.message,
      targetGroup,
    };
    if (targetGroup === 'specific' && data.specificUserId) payload.specificUserId = data.specificUserId;
    if (targetGroup === 'club' && data.clubId) payload.clubId = data.clubId;
    if (Array.isArray(data.targetIds) && data.targetIds.length > 0) payload.targetIds = data.targetIds;
    return api('/admin/notifications/send', { method: 'POST', body: JSON.stringify(payload) });
  },

  // GET /admin/settings
  getSettings: () => api('/admin/settings'),
  // POST /admin/settings
  updateSettings: (data) =>
    api('/admin/settings', { method: 'POST', body: JSON.stringify(data) }),

  // POST /admin/kill-switch
  toggleKillSwitch: (enabled) =>
    api('/admin/kill-switch', { method: 'POST', body: JSON.stringify({ enabled }) }),

  // ═══════════════════════════════════════════════════
  // WALLET ADMIN — /wallet/admin/*
  // ═══════════════════════════════════════════════════
  // POST /wallet/admin/credit
  creditWallet: (data) =>
    api('/wallet/admin/credit', { method: 'POST', body: JSON.stringify(data) }),
  // POST /wallet/admin/deduct
  deductWallet: (data) =>
    api('/wallet/admin/deduct', { method: 'POST', body: JSON.stringify(data) }),

  // ═══════════════════════════════════════════════════
  // MODERATION — Uses /feed, /posts/*, /stories/*, /admin/reports
  // ═══════════════════════════════════════════════════
  // GET /admin/posts OR /posts — list posts for moderation review
  getPosts: async (params = '') => {
    const normalizePosts = (items) =>
      (items || []).map((p) => ({
        ...p,
        id: p.id || p.post_id,
        author:
          p.author ||
          p.author_username ||
          p.username ||
          p.user?.username ||
          p.created_by_username ||
          'unknown',
        club: p.club || p.club_name || p.group_name || '—',
        created_at: p.created_at || p.createdAt || null,
      }));

    const feedQs = new URLSearchParams({ tab: 'for-you', limit: '100' });
    if (params && String(params).trim()) {
      new URLSearchParams(String(params).replace(/^\?/, '')).forEach((v, k) => feedQs.set(k, v));
    }
    const postsQs = params && String(params).trim() ? `?${String(params).replace(/^\?/, '')}` : '';
    const endpoints = [`/feed?${feedQs.toString()}`, `/posts${postsQs}`, `/admin/posts${postsQs}`];
    const res = await apiWithFallbacks(endpoints);
    const items = Array.isArray(res) ? res : (res?.items || res?.posts || res?.data || []);
    return normalizePosts(items);
  },
  // GET /posts/{id} — post details with comments_count/likes_count
  getPost: (id) => api(`/posts/${encodeURIComponent(String(id))}`),
  // DELETE post — try admin routes first; on 5xx/404 try alternate paths (apiWithFallbacks does not retry 500)
  deletePost: async (id) => {
    const e = encodeURIComponent(String(id));
    const paths = [
      `/admin/posts/${e}`,
      `/api/admin/posts/${e}`,
      `/admin/feed/posts/${e}`,
      `/feed/posts/${e}`,
      `/posts/${e}`,
    ];
    let lastErr;
    for (const path of paths) {
      try {
        return await api(path, { method: 'DELETE' });
      } catch (err) {
        lastErr = err;
        const st = err?.status;
        const msg = (err?.message || '').toLowerCase();
        if (st === 409 || msg.includes('conflict')) throw err;
        const tryNext =
          st === 404 ||
          st === 405 ||
          st === 403 ||
          st === 401 ||
          st === 400 ||
          (st >= 500 && st < 600) ||
          msg.includes('cannot ') ||
          msg.includes('not found') ||
          msg.includes('forbidden') ||
          msg.includes('unauthorized') ||
          msg.includes('http 404') ||
          msg.includes('http 403') ||
          msg.includes('http 500');
        if (!tryNext) throw err;
      }
    }
    throw lastErr || new Error('Delete post failed');
  },
  // POST /posts/{id}/report
  reportPost: (id) =>
    api(`/posts/${encodeURIComponent(String(id))}/report`, { method: 'POST' }),

  getStories: async () => {
    const res = await api('/stories/feed');
    const items = Array.isArray(res) ? res : (res?.stories || res?.data?.stories || res?.result?.stories || res?.payload?.stories || res?.data || res?.items || []);
    
    // If it's a user-based story feed (nested stories)
    if (items.length > 0 && items[0].stories) {
      let all = [];
      items.forEach(u => {
        (u.stories || []).forEach(s => all.push({ ...s, author: u.username || u.author }));
      });
      return all;
    }
    
    return items.map(s => ({
      ...s,
      id: s.id || s.story_id,
      author: s.author || s.username || s.user?.username || 'unknown',
      media_type: s.media_type || s.type || 'story'
    }));
  },
  // GET /stories/me — current user's active stories
  getMyStories: () => api('/stories/me'),
  // DELETE /admin/stories/{id} — admin route bypasses ownership check
  deleteStory: (id) => api(`/admin/stories/${encodeURIComponent(String(id))}`, { method: 'DELETE' }),

  // DELETE comment — try post-scoped routes first when postId is known, then global admin path
  deleteComment: (commentId, postId) => {
    const c = encodeURIComponent(String(commentId));
    const endpoints = [];
    if (postId != null && String(postId).trim() !== '') {
      const p = encodeURIComponent(String(postId).trim());
      endpoints.push(
        `/admin/posts/${p}/comments/${c}`,
        `/posts/${p}/comments/${c}`,
        `/admin/posts/${p}/comment/${c}`,
        `/posts/${p}/comment/${c}`
      );
    }
    endpoints.push(`/admin/comments/${c}`, `/api/admin/comments/${c}`);
    return apiWithFallbacks(endpoints, { method: 'DELETE' });
  },

  // Comments — GET /posts/{id}/comments (per-post, no global feed)
  getPostComments: (postId) => api(`/posts/${postId}/comments`),
  // POST /posts/{id}/comment (add comment — not needed for admin)

  // ═══════════════════════════════════════════════════
  // BLOGS — /blogs/* (Admin CRUD)
  // ═══════════════════════════════════════════════════
  getBlogs: (params = '') => api(`/blogs?${params}`),
  getBlog: (id) => api(`/blogs/${id}`),
  createBlog: (data) => api('/blogs', { method: 'POST', body: JSON.stringify(data) }),
  updateBlog: (id, data) =>
    api(`/blogs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBlog: (id) => api(`/blogs/${id}`, { method: 'DELETE' }),
  getBlogUploadUrl: () => api('/blogs/admin/upload-url'),

  // ═══════════════════════════════════════════════════
  // DEALS — /deals/* (Admin CRUD)
  // ═══════════════════════════════════════════════════
  getDeals: () => api('/deals/current'),
  createDeal: (data) => api('/deals', { method: 'POST', body: JSON.stringify(data) }),
  deleteDeal: (id) => api(`/deals/${id}`, { method: 'DELETE' }),

  // ═══════════════════════════════════════════════════
  // SUPPORT — /support/admin/* (Admin Only)
  // ═══════════════════════════════════════════════════
  getTickets: (params = '') => api(`/support/admin?${params}`),
  updateTicket: (id, { status, admin_response }) =>
    api(`/support/admin/${id}`, { method: 'PATCH', body: JSON.stringify({ status, admin_response }) }),

  // ═══════════════════════════════════════════════════
  // CLUBS — /clubs/* + /admin/clubs/*
  // Backend surface (prod may implement a subset — we try in order):
  // - GET /clubs, GET /clubs/:slug|id, GET /admin/clubs/:id (detail when public 500/404)
  // - Suspend: PATCH /admin/clubs/:id/status { status|account_status }, PATCH|POST .../suspend (not PATCH /clubs/:id/status — often no-op)
  // - After a 2xx PATCH we re-GET admin/public detail to confirm status changed (avoids false “success” toasts)
  // - Activate: PATCH .../status { active }, PATCH|POST .../activate, PATCH .../unsuspend
  // - DELETE: /admin/clubs/:id, /api/admin/clubs/:id, /clubs/:id
  // - Transfer: POST|PATCH /admin/clubs/:id/transfer | .../transfer-owner (+ newOwnerId / new_owner_id)
  // Local mock (server/index.js): PATCH /api/admin/clubs/:id/suspend, PATCH .../transfer-owner
  // ═══════════════════════════════════════════════════
  getClubs: (params = '') => api(`/clubs?${params}`),
  searchClubs: (q) => api(`/clubs/search?q=${encodeURIComponent(q)}`),
  // Prefer admin detail when public GET /clubs/:slug errors (500) for some rows
  getClub: async (slugOrId) => {
    const enc = encodeURIComponent(String(slugOrId));
    let lastErr;
    for (const path of [`/admin/clubs/${enc}`, `/clubs/${enc}`]) {
      try {
        return await api(path);
      } catch (e) {
        lastErr = e;
        const st = e?.status;
        if (!(st === 404 || st === 403 || st === 401 || st === 400 || st === 405 || st === 500 || st === 502 || st === 503)) {
          throw e;
        }
      }
    }
    throw lastErr || new Error('Club not found');
  },
  createClub: (data) => {
    const rawName = String(data?.name || '').trim();
    const computedSlug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const payload = {
      ...data,
      slug: String(data?.slug || '').trim() || computedSlug || `club-${Date.now()}`,
    };
    return api('/clubs', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateClub: (id, data) => {
    // PATCH /clubs/:id requires club owner role — admin users may not be owners
    // Try admin status endpoint if updating status, otherwise try the user route
    if (data && data.status && Object.keys(data).length === 1) {
      return api(`/admin/clubs/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify(data) });
    }
    return api(`/clubs/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  deleteClubMember: (clubId, memberId) =>
    api(`/clubs/${clubId}/members/${memberId}`, { method: 'DELETE' }),
  getClubMembers: (id) => api(`/clubs/${id}/members`),
  // Use admin endpoint for club posts — bypasses privacy restrictions
  getClubPosts: (slugOrId) => {
    const enc = encodeURIComponent(String(slugOrId));
    return apiWithFallbacks([`/admin/clubs/${enc}/posts`, `/clubs/${enc}/posts`]);
  },
  deleteClub: (idOrClub) => tryClubEndpoints(idOrClub, '', { method: 'DELETE' }),
  // Backend variants: PATCH /admin/clubs/:id/status { status }, PATCH /admin/clubs/:id/suspend, etc.
  suspendClub: (idOrClub) => tryClubSuspendOrActivate(idOrClub, 'suspend'),
  activateClub: (idOrClub) => tryClubSuspendOrActivate(idOrClub, 'activate'),
  // Mock uses PATCH /api/admin/clubs/:id/transfer-owner; prod may use POST .../transfer
  transferClubOwnership: async (id, newOwnerId) => {
    const enc = encodeURIComponent(String(id));
    const bodies = [
      JSON.stringify({ newOwnerId }),
      JSON.stringify({ new_owner_id: newOwnerId }),
    ];
    const paths = [
      `/admin/clubs/${enc}/transfer`,
      `/admin/clubs/${enc}/transfer-owner`,
      `/api/admin/clubs/${enc}/transfer-owner`,
    ];
    let lastErr;
    for (const path of paths) {
      for (const body of bodies) {
        for (const method of ['POST', 'PATCH']) {
          try {
            return await api(path, { method, body });
          } catch (e) {
            lastErr = e;
            if (!isClubMutationRetryable(e)) throw e;
          }
        }
      }
    }
    throw lastErr || new Error('Transfer ownership failed');
  },

  // ═══════════════════════════════════════════════════
  // BOOKS — /books/* (Full CRUD for admin)
  // ═══════════════════════════════════════════════════
  getBooks: async (params = '') => {
    const qs = buildBooksListQuery(params);
    // Try marketplace /books first: /admin/books often 401s when unimplemented and would log the admin out.
    const endpoints = [`/books${qs}`, `/admin/books${qs}`, `/api/admin/books${qs}`];
    const unwrap = (p) => {
      if (Array.isArray(p)) return p;
      if (!p || typeof p !== 'object') return [];
      const nested =
        p.books ||
        p.items ||
        p.results ||
        p.rows ||
        p.list ||
        p.records ||
        p.data?.books ||
        p.data?.items ||
        p.data?.list ||
        p.data?.rows ||
        p.data?.results ||
        p.result?.books ||
        p.result?.items ||
        p.payload?.books ||
        p.payload?.items ||
        (Array.isArray(p.data) ? p.data : null) ||
        p.products;
      if (Array.isArray(nested)) return nested;
      return [];
    };
    let lastErr = null;
    let lastList = [];
    for (let i = 0; i < endpoints.length; i++) {
      const isLast = i === endpoints.length - 1;
      try {
        const res = await api(endpoints[i], { soft401: !isLast });
        let list = unwrap(res);
        if (list.length === 0) list = extractBooksArrayFromResponse(res);
        if (list.length > 0) return list;
        lastList = list;
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        const msg = (err?.message || '').toLowerCase();
        const tryNext =
          msg.includes('cannot ') ||
          msg.includes('400') ||
          msg.includes('404') ||
          msg.includes('403') ||
          msg.includes('401') ||
          msg.includes('405') ||
          msg.includes('unauthorized') ||
          msg.includes('forbidden') ||
          msg.includes('not found') ||
          msg.includes('must be') ||
          msg.includes('http 400') ||
          msg.includes('http 404') ||
          msg.includes('http 403') ||
          msg.includes('http 401');
        if (!tryNext) throw err;
      }
    }
    if (lastErr && !Array.isArray(lastList)) throw lastErr;
    return lastList;
  },
  getBook: (id) => api(`/books/${id}`),
  getBookReviews: (id, params = '') => api(`/books/${id}/reviews?${params}`),
  // Backend has NO single-book POST; wrap into bulk format: { key: bookObj }
  addBook: (data) => {
    const key = data.isbn || (data.title || '').replace(/\s+/g, '_').slice(0, 30) || `book_${Date.now()}`;
    const entry = toAdminBulkBookEntry(data);
    const payload = { [key]: entry };
    return api('/admin/books/bulk', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateBook: (idOrRow, data) => {
    const id = typeof idOrRow === 'object' ? (idOrRow.id || idOrRow.book_id || idOrRow._id || idOrRow.isbn) : idOrRow;
    return api(`/admin/books/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  deleteBook: (idOrRow) => tryDeleteBookByPaths(idOrRow),
  updateBookStock: (idOrRow, offset) => {
    const id = typeof idOrRow === 'object' ? (idOrRow.id || idOrRow.book_id || idOrRow._id || idOrRow.isbn) : idOrRow;
    return api(`/admin/books/${encodeURIComponent(id)}/stock`, { method: 'PATCH', body: JSON.stringify({ offset }) });
  },
  // Backend expects POST /admin/books/bulk with { key1: bookObj, key2: bookObj }
  bulkUploadBooks: async (fileOrData) => {
    // If a File (CSV), parse client-side and convert to object-of-objects
    if (typeof File !== 'undefined' && fileOrData instanceof File) {
      const text = await fileOrData.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const booksObj = {};
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((h, j) => { row[h] = vals[j] || ''; });
        if (!row.title) continue; // skip rows without title
        const key = row.isbn || row.title.replace(/\s+/g, '_').slice(0, 30) || `row_${i}`;
        booksObj[key] = toAdminBulkBookEntry(row);
      }
      if (Object.keys(booksObj).length === 0) throw new Error('No valid book rows found in CSV');
      return api('/admin/books/bulk', { method: 'POST', body: JSON.stringify(booksObj) });
    }
    // If already an object, send directly
    return api('/admin/books/bulk', { method: 'POST', body: JSON.stringify(fileOrData) });
  },

  // ═══════════════════════════════════════════════════
  // COMMENTS — aggregate via /posts/{id}/comments
  // ═══════════════════════════════════════════════════
  getComments: async () => {
    const posts = await adminApi.getPosts('limit=20');
    const postList = Array.isArray(posts) ? posts : [];
    let allComments = [];
    for (const p of postList.slice(0, 10)) {
      if (!p?.id) continue;
      try {
        const comments = await api(`/posts/${p.id}/comments?limit=50&offset=0`);
        const list = Array.isArray(comments)
          ? comments
          : (comments?.comments
            || comments?.data?.comments
            || comments?.result?.comments
            || comments?.payload?.comments
            || (Array.isArray(comments?.data) ? comments.data : null)
            || (Array.isArray(comments?.items) ? comments.items : null)
            || []);
        allComments.push(...list.map(c => ({
          ...c,
          id: c.id || c.comment_id,
          post_id: c.post_id || p.id,
          post_title: c.post_title || c.post?.title || p.title || p.content?.substring(0, 40) || 'Post',
          author: c.author || c.username || c.user?.username || 'unknown'
        })));
      } catch {}
    }
    return allComments;
  },

  // ═══════════════════════════════════════════════════
  // ORDERS — /orders/*
  // ═══════════════════════════════════════════════════
  getOrders: async (params = '') => {
    const base = params ? `?${params}` : '';
    const unwrapList = (p) => {
      if (Array.isArray(p)) return p;
      if (!p || typeof p !== 'object') return [];
      return (
        p.orders ||
        p.items ||
        p.rows ||
        p.records ||
        p.results ||
        p.list ||
        p.data?.orders ||
        p.data?.items ||
        p.data?.rows ||
        p.data?.list ||
        p.data?.records ||
        p.result?.orders ||
        p.result?.items ||
        (Array.isArray(p.data) ? p.data : null) ||
        (Array.isArray(p.items) ? p.items : null) ||
        []
      );
    };

    // GET /orders often returns [] for non-customer tokens while /admin/orders has the real list.
    // apiWithFallbacks stops on first HTTP 200 — so we must try each URL until we get a non-empty list.
    // /orders/history returns full order objects (user_id, created_at, items) for the authenticated user.
    const tryEndpoints = [`/admin/orders${base}`, `/api/admin/orders${base}`, `/orders${base}`, `/orders/history${base}`];
    let lastList = [];
    for (const ep of tryEndpoints) {
      try {
        const res = await api(ep);
        const list = unwrapList(res).map((row) => prepareOrderForUi(row));
        if (list.length > 0) return list;
        lastList = list;
      } catch (e) {
        const msg = (e?.message || '').toLowerCase();
        const skip =
          msg.includes('404') ||
          msg.includes('403') ||
          msg.includes('not found') ||
          msg.includes('forbidden') ||
          msg.includes('cannot ');
        if (!skip) throw e;
      }
    }
    return lastList;
  },
  getOrder: async (id) => {
    if (!id) throw new Error('Order id required');
    const orders = await adminApi.getOrders('limit=500&offset=0');
    const match = (orders || []).find((o) => String(o?.id) === String(id));
    if (!match) {
      throw new Error('Order detail endpoint is not available on backend, and this order is not present in current history response.');
    }
    return prepareOrderForUi(match);
  },
  // enarv-backend: PATCH /orders/:id/status (requireAdmin + authenticate via spread)
  updateOrderStatus: (id, status, note) => {
    const e = encodeURIComponent(String(id));
    const body = JSON.stringify({
      status,
      shipping_status: status,
      fulfillment_status: status,
      note,
    });
    return apiWithFallbacks(
      [`/orders/${e}/status`, `/admin/orders/${e}/status`, `/api/admin/orders/${e}/status`],
      { method: 'PATCH', body }
    );
  },
  cancelOrder: (id) => {
    const e = encodeURIComponent(String(id));
    const body = JSON.stringify({
      status: 'cancelled',
      shipping_status: 'cancelled',
      fulfillment_status: 'cancelled',
    });
    return apiWithFallbacks(
      [`/orders/${e}/status`, `/admin/orders/${e}/status`, `/api/admin/orders/${e}/status`],
      { method: 'PATCH', body }
    );
  },

  // ═══════════════════════════════════════════════════
  // USERS/PROFILES — /users/*
  // ═══════════════════════════════════════════════════
  searchUsers: (q) => api(`/users/search?q=${encodeURIComponent(q)}`),
  getUserProfile: (username) => api(`/users/${username}`),
  getUserPosts: (username) => api(`/users/${username}/posts`),
  getUserClubs: (username) => api(`/users/${username}/clubs`),
  getUserFollowers: (username) => api(`/users/${username}/followers`),
  getUserFollowing: (username) => api(`/users/${username}/following`),
  getMyReferralStats: () => api('/users/me/referrals'),
  getMyReferredUsers: (params = '') => api(`/users/me/referrals/users?${params}`),
  // PATCH /admin/users/:id/permissions does NOT exist on the backend
  updateUserPermissions: () => {
    throw new Error('User role/permissions management is not available on the backend. This feature requires a backend update.');
  },

  // ═══════════════════════════════════════════════════
  // SEARCH — /search/*
  // ═══════════════════════════════════════════════════
  globalSearch: (q) => api(`/search/global?q=${encodeURIComponent(q)}`),

  getLimitedTimeOffers: () => api('/deals/current'),
  createLimitedTimeOffer: (data) => api('/deals', { method: 'POST', body: JSON.stringify(data) }),
  deleteLimitedTimeOffer: (id) => api(`/deals/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ═══════════════════════════════════════════════════
  // FEATURED AUTHORS — (Mocking since backend does not support yet)
  // ═══════════════════════════════════════════════════
  getFeaturedAuthors: () => Promise.resolve([]),
  addFeaturedAuthor: (data) => Promise.resolve({ success: true }),
  removeFeaturedAuthor: (id) => Promise.resolve({ success: true }),

  // ═══════════════════════════════════════════════════
  // NOTIFICATION HISTORY — /admin/notifications/history
  // ═══════════════════════════════════════════════════
  getNotificationHistory: () => Promise.resolve([]),

  // ═══════════════════════════════════════════════════
  // CLUBS — Pin / Highlight posts
  // ═══════════════════════════════════════════════════
  // Pin/Highlight club posts — NOT supported by backend (no such routes exist)
  pinClubPost: () => {
    throw new Error('Pin/unpin club posts is not supported by the backend API.');
  },
  highlightClubPost: () => {
    throw new Error('Highlight club posts is not supported by the backend API.');
  },

  // ═══════════════════════════════════════════════════
  // ANALYTICS — Real 30-day series from dashboard + users + orders + feed + comments sample + referrals
  // ═══════════════════════════════════════════════════
  getAnalytics: async () => {
    const last30Days = Array.from({ length: 30 }, (_, i) =>
      new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0]
    );
    const daySet = new Set(last30Days);

    const dayKeyFromRecord = (row, keys) => {
      for (const k of keys) {
        const ms = coerceTimestamp(row?.[k]);
        if (ms == null) continue;
        const ymd = new Date(ms).toISOString().split('T')[0];
        if (daySet.has(ymd)) return ymd;
      }
      return null;
    };

    const bump = (map, key) => {
      if (!key || !daySet.has(key)) return;
      map[key] = (map[key] || 0) + 1;
    };

    const [dashboard, usersRes, orders, posts, comments, referredRes] = await Promise.all([
      api('/admin/dashboard').catch(() => ({})),
      api('/admin/users?limit=3000&offset=0').catch(() => []),
      adminApi.getOrders('limit=2000&offset=0').catch(() => []),
      adminApi.getPosts('limit=400').catch(() => []),
      adminApi.getComments().catch(() => []),
      api('/users/me/referrals/users?limit=500').catch(() => []),
    ]);

    const users = Array.isArray(usersRes) ? usersRes : (usersRes?.users || usersRes?.items || []);
    const orderRows = Array.isArray(orders) ? orders.map((o) => prepareOrderForUi(o)) : [];
    const postList = Array.isArray(posts) ? posts : [];
    const commentList = Array.isArray(comments) ? comments : [];
    const referred = Array.isArray(referredRes)
      ? referredRes
      : (referredRes?.users || referredRes?.items || referredRes?.data || []);

    const userSignupMap = {};
    users.forEach((u) => {
      const dk = dayKeyFromRecord(u, ['created_at', 'createdAt', 'joined_at', 'joinedAt']);
      if (dk) bump(userSignupMap, dk);
    });

    const orderMap = {};
    orderRows.forEach((o) => {
      const dk = dayKeyFromRecord(o, ['created_at', 'createdAt', 'ordered_at', 'placed_at', 'inserted_at']);
      if (dk) bump(orderMap, dk);
    });

    const postMap = {};
    postList.forEach((p) => {
      const dk = dayKeyFromRecord(p, ['created_at', 'createdAt', 'updated_at', 'updatedAt']);
      if (dk) bump(postMap, dk);
    });

    const commentMap = {};
    commentList.forEach((c) => {
      const dk = dayKeyFromRecord(c, ['created_at', 'createdAt']);
      if (dk) bump(commentMap, dk);
    });

    const referralMap = {};
    referred.forEach((r) => {
      const dk = dayKeyFromRecord(r, ['created_at', 'createdAt', 'joined_at', 'joinedAt', 'signed_up_at']);
      if (dk) bump(referralMap, dk);
    });

    const metrics = dashboard?.metrics || dashboard;
    const reportedTotal =
      metrics?.users?.total ??
      dashboard?.totalUsers ??
      (typeof metrics?.users === 'number' ? metrics.users : null);
    const signupsInWindow = last30Days.reduce((acc, d) => acc + (userSignupMap[d] || 0), 0);
    const startBaseline =
      reportedTotal != null && Number.isFinite(reportedTotal) && reportedTotal >= signupsInWindow
        ? reportedTotal - signupsInWindow
        : 0;

    let cumUsers = startBaseline;
    const userGrowth = last30Days.map((d) => {
      cumUsers += userSignupMap[d] || 0;
      return { date: d, count: cumUsers };
    });

    const newSignupsPerDay = last30Days.map((d) => ({ date: d, count: userSignupMap[d] || 0 }));
    const postsPerDay = last30Days.map((d) => ({ date: d, count: postMap[d] || 0 }));
    const commentsPerDay = last30Days.map((d) => ({ date: d, count: commentMap[d] || 0 }));
    const ordersPerDay = last30Days.map((d) => ({ date: d, count: orderMap[d] || 0 }));
    const referralGrowth = last30Days.map((d) => ({ date: d, count: referralMap[d] || 0 }));

    return {
      userGrowth,
      dailyActiveUsers: newSignupsPerDay,
      postsPerDay,
      commentsPerDay,
      ordersPerDay,
      referralGrowth,
      _meta: {
        usersSampled: users.length,
        ordersSampled: orderRows.length,
        postsSampled: postList.length,
        commentsSampled: commentList.length,
        referralsSampled: referred.length,
        commentsNote:
          'Comments are counted from a sample of recent posts (same source as Moderation → Comments).',
      },
    };
  },
};
