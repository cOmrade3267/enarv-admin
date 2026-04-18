'use client';

import { useState, useEffect } from 'react';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { adminApi, prepareOrderForUi, coerceTimestamp, deepFindUserString, deepFindTimestamp } from '@/lib/api';
import Link from 'next/link';

const shippingStatuses = ['pending', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];

const PAYMENT_LIKE_STATUSES = new Set(['paid', 'unpaid', 'pending', 'failed', 'refunded', 'processing', 'completed', 'authorized', 'captured']);

function normalizeOrderItem(item) {
  if (!item || typeof item !== 'object') return { title: 'Item', quantity: 1, price_paid: 0 };
  const title =
    item.title ||
    item.book_title ||
    item.name ||
    item.product_name ||
    item.book?.title ||
    item.product?.title ||
    item.sku ||
    (item.book_id ? `Book ${String(item.book_id).replace(/-/g, '').slice(0, 8)}…` : '') ||
    (item.product_id ? `Product ${String(item.product_id).slice(0, 8)}…` : '') ||
    'Item';
  const quantity = item.quantity ?? item.qty ?? item.count ?? 1;
  let price = item.price_paid ?? item.price ?? item.amount ?? item.unit_price ?? item.subtotal ?? item.line_total ?? 0;
  if (typeof price === 'number' && price > 10000) price = price / 100;
  return { ...item, title, quantity, price_paid: price };
}

function normalizeOrderRow(input, userLookup = {}) {
  const o = prepareOrderForUi(input);
  const amount = o.amount ?? o.total ?? o.total_amount ?? o.bill_amount ?? o.grand_total ?? o.subtotal ?? o.payable_amount ?? 0;
  const rawUser = o.user;
  let userStr = '';
  if (typeof rawUser === 'string') userStr = rawUser;
  else if (rawUser && typeof rawUser === 'object') {
    userStr =
      rawUser.username ||
      rawUser.name ||
      (rawUser.email && String(rawUser.email).split('@')[0]) ||
      '';
  }
  userStr =
    userStr ||
    o.user_username ||
    o.username ||
    o.buyer_username ||
    o.customer_username ||
    o.customer_name ||
    o.display_name ||
    o.displayName ||
    o.full_name ||
    o.fullName ||
    o.placed_by ||
    o.ordered_by ||
    o.user_email ||
    o.userEmail ||
    o.contact_email ||
    o.shipping_address?.name ||
    o.shipping_address?.full_name ||
    o.billing_address?.name ||
    o.recipient_name ||
    (o.email && String(o.email).split('@')[0]) ||
    (o.shipping_address?.email && String(o.shipping_address.email).split('@')[0]) ||
    '';

  let user_id =
    (typeof o.user === 'object' && o.user?.id) ||
    o.user_id ||
    o.userId ||
    o.customer_id ||
    o.buyer_id ||
    o.uid ||
    o.firebase_uid ||
    o.firebaseUid ||
    o.user_uid ||
    '';

  if (typeof rawUser === 'string' && /^[0-9a-f-]{36}$/i.test(rawUser.trim())) {
    user_id = user_id || rawUser.trim();
  }
  if (!userStr) {
    const deepUser = deepFindUserString(o);
    if (deepUser) userStr = deepUser;
  }

  // Cross-reference with admin users lookup
  if (!userStr && user_id && userLookup[user_id]) {
    userStr = userLookup[user_id];
  }
  if (!userStr && user_id) {
    userStr = `Customer ${String(user_id).replace(/-/g, '').slice(0, 8)}…`;
  }

  const paymentLike = ['paid', 'pending', 'unpaid', 'failed', 'refunded', 'processing', 'completed'];
  let payment_status =
    o.payment_status ||
    o.paymentStatus ||
    o.payment?.status ||
    (typeof o.status === 'string' && paymentLike.includes(o.status.toLowerCase()) ? o.status : null) ||
    'pending';
  if (o.status === 'paid' && (payment_status === 'pending' || !payment_status)) payment_status = 'paid';

  let shipping_status =
    o.shipping_status ||
    o.shippingStatus ||
    o.fulfillment_status ||
    o.delivery_status ||
    o.fulfillment?.status ||
    '';
  const st = o.status != null ? String(o.status).toLowerCase() : '';
  if (!shipping_status && st && !PAYMENT_LIKE_STATUSES.has(st)) {
    shipping_status = o.status;
  }
  if (!shipping_status) shipping_status = 'pending';

  let items =
    o.items ||
    o.order_items ||
    o.line_items ||
    o.lineItems ||
    o.orderLines ||
    o.purchasedItems ||
    o.products ||
    o.books ||
    o.lines ||
    o.order_lines ||
    o.cart_items ||
    [];
  if (!Array.isArray(items)) items = [];
  items = items.map(normalizeOrderItem);

  const dateKeys = [
    'created_at',
    'createdAt',
    'order_date',
    'placed_at',
    'ordered_at',
    'timestamp',
    'date',
    'inserted_at',
    'updated_at',
    'time',
    'purchase_date',
    'purchaseDate',
    'submitted_at',
    'submittedAt',
  ];
  let created_at = null;
  for (const key of dateKeys) {
    const ts = coerceTimestamp(o[key]);
    if (ts != null) {
      created_at = ts;
      break;
    }
  }
  if (created_at == null) {
    const deepTs = deepFindTimestamp(o);
    if (deepTs != null) created_at = deepTs;
  }

  let amt = typeof amount === 'number' ? amount : Number(amount) || 0;
  if (amt > 10000) amt = amt / 100;

  return {
    ...o,
    id: o.id || o.order_id || o.orderId || o._id,
    user: userStr || '—',
    user_id,
    amount: amt,
    payment_status,
    shipping_status,
    items,
    created_at: created_at != null ? new Date(created_at).toISOString() : null,
  };
}

/**
 * Pull order-like arrays from dashboard payloads (shapes vary by API).
 * Merges root `username` / `created_at` with nested `orders[]` (same behaviour as real API).
 */
function collectOrdersFromDashboard(dash) {
  if (!dash || typeof dash !== 'object') return [];
  const ra = dash.recent_activity || dash.activity || dash.data?.recent_activity || dash.data?.activity || {};

  const merge = (...parts) => {
    let o = {};
    for (const p of parts) {
      if (p && typeof p === 'object' && !Array.isArray(p)) o = { ...o, ...p };
    }
    return o;
  };

  const seen = new Set();
  const out = [];

  function pushOrder(order, parent) {
    const id = order?.id || order?.order_id || order?.orderId;
    const key = id || `idx:${out.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    const block = merge(dash, parent);
    const pu = block.username || block.user_name || block.user?.username;
    const parentDate = block.created_at || block.createdAt;
    out.push({
      ...order,
      ...(pu && !order?.username && !order?.user && !order?.user_username
        ? { username: pu, user_username: pu }
        : {}),
      ...(parentDate && !order?.created_at && !order?.createdAt ? { created_at: parentDate } : {}),
    });
  }

  function walkBlock(block) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return;
    if (Array.isArray(block.orders)) {
      for (const o of block.orders) pushOrder(o, block);
    }
  }

  walkBlock(dash);
  walkBlock(dash.recent_activity);
  walkBlock(dash.activity);
  walkBlock(dash.data);
  walkBlock(dash.data?.recent_activity);
  walkBlock(dash.data?.activity);
  walkBlock(dash.metrics);
  walkBlock(dash.store);
  walkBlock(dash.recent_activity?.store);

  const chunkSpecs = [
    [ra.orders, ra],
    [ra.latest_orders, ra],
    [dash.latestOrders, dash],
    [dash.data?.orders, dash.data],
    [ra.store?.recent_orders, ra.store],
    [dash.store?.recent_orders, dash.store],
  ];
  for (const [arr, parent] of chunkSpecs) {
    if (!Array.isArray(arr)) continue;
    for (const o of arr) pushOrder(o, parent);
  }

  const ru = dash.username || dash.user_name || dash.user?.username;
  const rd = dash.created_at || dash.createdAt;
  if (!ru && !rd) return out;

  return out.map((o) => ({
    ...o,
    ...(ru && !o.username && !o.user?.username && !o.user_username ? { username: ru, user_username: ru } : {}),
    ...(rd && !o.created_at && !o.createdAt ? { created_at: rd } : {}),
  }));
}

function indexOrdersById(orders) {
  const map = {};
  for (const o of orders) {
    const id = o?.id || o?.order_id || o?.orderId;
    if (id) map[id] = { ...map[id], ...o };
  }
  return map;
}

export default function OrdersPage() {
  const showToast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusModal, setStatusModal] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  useEffect(() => { loadOrders(); }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      // Fetch users in parallel to resolve user_id → username
      const [apiListRaw, dash, usersRes] = await Promise.all([
        adminApi.getOrders().catch(() => []),
        adminApi.getDashboard().catch(() => null),
        adminApi.getUsers('limit=2000&offset=0').catch(() => ({ users: [] })),
      ]);

      // Build user lookup map: user_id → username/full_name (match Firebase uid etc.)
      const userList = usersRes?.users || (Array.isArray(usersRes) ? usersRes : []);
      const userLookup = {};
      userList.forEach((u) => {
        const label =
          u.username || u.full_name || u.name || (u.email && u.email.split('@')[0]) || '';
        const keys = [u.id, u.user_id, u.firebase_uid, u.firebaseUid, u.uid].filter(Boolean);
        keys.forEach((k) => {
          if (k && label) userLookup[String(k)] = label;
        });
      });

      let list = Array.isArray(apiListRaw) ? apiListRaw : [];

      const dashOrders = collectOrdersFromDashboard(dash);
      const byId = indexOrdersById(dashOrders);

      let source = 'empty';

      if (list.length > 0) {
        list = list.map((row) => {
          const id = row.id || row.order_id || row.orderId;
          const extra = id && byId[id] ? byId[id] : null;
          return extra ? { ...row, ...extra } : row;
        });
        const anyMerged = list.some((row) => {
          const id = row.id || row.order_id || row.orderId;
          return Boolean(id && byId[id]);
        });
        source = anyMerged ? 'merged' : 'api';
      } else if (dashOrders.length > 0) {
        list = dashOrders;
        source = 'dashboard';
      }

      // When orders come from dashboard (limited data: id, amount, status only),
      // try to enrich each order by fetching individual details
      if (source === 'dashboard' && list.length > 0) {
        const enriched = await Promise.all(
          list.map(async (order) => {
            const id = order.id || order.order_id;
            if (!id) return order;
            try {
              const detail = await adminApi.getOrder(id);
              return { ...order, ...detail };
            } catch {
              return order;
            }
          })
        );
        list = enriched;
      }

      const normalized = list.map(row => normalizeOrderRow(row, userLookup));
      setOrders(normalized);
    } catch (err) {
      showToast(err.message || 'Failed to load orders', 'error');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate() {
    if (!statusModal || !selectedStatus) return;
    try {
      await adminApi.updateOrderStatus(statusModal.id, selectedStatus);
      showToast('Order status updated');
      await loadOrders();
    } catch (err) {
      showToast(err.message || 'Failed to update order status', 'error');
    }
    setStatusModal(null);
  }

  async function handleCancel(order) {
    try {
      await adminApi.cancelOrder(order.id);
      showToast('Order cancelled');
      await loadOrders();
    } catch (err) {
      showToast(err.message || 'Failed to cancel order', 'error');
    }
  }

  async function openOrderDetail(row) {
    setDetailModal({ ...row, _loadError: null });
    setDetailLoading(true);
    try {
      const raw = await adminApi.getOrder(row.id);
      const merged = normalizeOrderRow(prepareOrderForUi({ ...row, ...raw }));
      setDetailModal({ ...merged, _loadError: null });
    } catch (err) {
      const msg = err?.message || 'Could not load order details';
      showToast(msg, 'error');
      setDetailModal({ ...row, _loadError: msg });
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div id="orders-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-subtitle">Manage e-commerce transactions</p>
        </div>
      </div>

      <DataTable
        id="orders-table"
        columns={[
          { header: 'Order ID', accessor: 'id', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.id}</strong> },
          { header: 'User', accessor: 'user', render: (r) => {
            const u = r.user;
            const label = (() => {
              if (u == null || u === '' || u === '—') return '—';
              const s = String(u);
              if (s.startsWith('Customer')) return s;
              if (s.includes('@')) return s;
              return `@${s}`;
            })();
            return r.user_id ? <Link href={`/users/${r.user_id}`} style={{ color: 'var(--accent-primary)' }}>{label}</Link> : <span>{label}</span>;
          } },
          { header: 'Books', accessor: (r) => r.items?.map(i => i.title).join(', '), render: (r) => (r.items?.length ? r.items.map(i => i.title).filter(Boolean).join(', ') : '—') },
          { header: 'Amount', accessor: 'amount', render: (r) => <strong>₹{r.amount?.toLocaleString()}</strong> },
          { header: 'Payment', accessor: 'payment_status', render: (r) => <StatusBadge status={r.payment_status} /> },
          { header: 'Shipping', accessor: 'shipping_status', render: (r) => <StatusBadge status={r.shipping_status} /> },
          { header: 'Date', accessor: 'created_at', render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
        ]}
        data={orders}
        loading={loading}
        actions={(row) => (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openOrderDetail(row)}>View</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setStatusModal(row); setSelectedStatus(row.shipping_status); }}>Status</button>
            {!['cancelled', 'delivered', 'returned'].includes(row.shipping_status) && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => handleCancel(row)}>Cancel</button>
            )}
          </div>
        )}
      />

      {/* Order Detail Modal */}
      <Modal isOpen={!!detailModal} onClose={() => { setDetailModal(null); setDetailLoading(false); }} title={`Order ${detailModal?.id}`} maxWidth="600px">
        {detailModal && (
          <div>
            {detailModal._loadError && (
              <div
                role="alert"
                style={{
                  marginBottom: 'var(--space-4)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--status-error-bg, rgba(239, 68, 68, 0.12))',
                  border: '1px solid var(--status-error)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-sm)',
                }}
              >
                <strong>Could not load full order from API.</strong> {detailModal._loadError}
              </div>
            )}
            {detailLoading && (
              <div className="loading-page" style={{ minHeight: 120, padding: 'var(--space-4)' }}>
                <div className="loading-spinner" />
              </div>
            )}
            <div style={{ marginBottom: 'var(--space-4)', opacity: detailLoading ? 0.4 : 1, pointerEvents: detailLoading ? 'none' : 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <span style={{ color: 'var(--text-muted)' }}>User</span>
                <span>
                  {(() => {
                    const u = detailModal.user;
                    if (u == null || u === '' || u === '—') return '—';
                    const s = String(u);
                    if (s.startsWith('Customer')) return s;
                    if (s.includes('@')) return s;
                    return `@${s}`;
                  })()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Date</span>
                <span>{detailModal.created_at ? new Date(detailModal.created_at).toLocaleString() : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Payment</span>
                <StatusBadge status={detailModal.payment_status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Shipping</span>
                <StatusBadge status={detailModal.shipping_status} />
              </div>
            </div>
            <h4 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-base)', fontWeight: 600 }}>Items</h4>
            {detailModal.items?.length ? detailModal.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span>{item.title} × {item.quantity}</span>
                <span>₹{item.price_paid != null ? Number(item.price_paid).toLocaleString() : '—'}</span>
              </div>
            )) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>No line items in the response.</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', fontWeight: 700, fontSize: 'var(--font-lg)' }}>
              <span>Total</span>
              <span>₹{detailModal.amount?.toLocaleString()}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Update Status Modal */}
      <Modal isOpen={!!statusModal} onClose={() => setStatusModal(null)} title="Update Shipping Status"
        footer={<><button className="btn btn-secondary" onClick={() => setStatusModal(null)}>Cancel</button><button className="btn btn-primary" onClick={handleStatusUpdate}>Update</button></>}>
        <div className="form-group">
          <label className="form-label">Order: <strong>{statusModal?.id}</strong></label>
          <select className="form-select" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
            {shippingStatuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </Modal>
    </div>
  );
}
