'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { adminApi, formatAdminApiError } from '@/lib/api';

function clubRowKey(c) {
  if (!c) return '';
  return String(c.id || c.slug || c.club_id || '');
}

/** Map list/detail payloads to a single status string for the admin table. */
function pickClubStatusFromApi(row, detail = null) {
  const src = { ...row, ...detail };
  if (src.is_suspended === true || src.suspended === true) return 'suspended';
  const raw =
    src.status ||
    src.club_status ||
    src.moderation_status ||
    src.account_status ||
    src.state ||
    null;
  if (raw == null) return 'active';
  const s = String(raw).toLowerCase();
  if (s === 'suspend' || s === 'suspended' || s === 'banned') return 'suspended';
  if (s === 'active' || s === 'published' || s === 'open') return 'active';
  return s;
}

export default function ClubsPage() {
  const showToast = useToast();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClub, setNewClub] = useState({ name: '', slug: '', description: '', privacy: 'public' });
  const [postsModal, setPostsModal] = useState(null); // { club, posts }
  const [clubPosts, setClubPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  /** @type {React.MutableRefObject<Record<string, string>>} Local status when GET /clubs omits club status after suspend/activate */
  const statusOverrideRef = useRef({});
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'delete'|'suspend'|'activate', club }
  const [transferModal, setTransferModal] = useState(null);
  const [newOwnerId, setNewOwnerId] = useState('');

  function unwrapResponse(payload, key) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return key ? [] : {};
    if (key) {
      return payload[key]
        || payload.data?.[key]
        || payload.result?.[key]
        || payload.payload?.[key]
        || (Array.isArray(payload.data) ? payload.data : null)
        || (Array.isArray(payload.result) ? payload.result : null)
        || (Array.isArray(payload.payload) ? payload.payload : null)
        || (Array.isArray(payload.rows) ? payload.rows : null)
        || (Array.isArray(payload.results) ? payload.results : null)
        || (Array.isArray(payload.list) ? payload.list : null)
        || (Array.isArray(payload.items) ? payload.items : []);
    }
    return payload.data || payload.result || payload.payload || payload;
  }

  const loadClubs = useCallback(async () => {
    try {
      const res = await adminApi.getClubs();
      const list = unwrapResponse(res, 'clubs');
      const usersRes = await adminApi.getUsers('limit=500').catch(() => null);
      const userList = unwrapResponse(usersRes, 'users');
      const userNameById = new Map(
        userList.map((u) => [u.id || u.user_id, u.username || u.user_name || u.full_name || u.name]).filter(([k, v]) => k && v)
      );

      const normalizedBase = list.map((c) => {
        const row = {
          ...c,
          id: c.id || c.club_id || c.slug,
          slug: c.slug || c.id || c.club_id,
          name: c.name || c.title || 'Untitled club',
          privacy: c.privacy || c.club_type || 'public',
          members_count: c.members_count ?? c.member_count ?? 0,
          created_by:
            c.created_by ||
            c.owner_username ||
            c.created_by_username ||
            userNameById.get(c.owner_id) ||
            c.username ||
            (c.owner_id ? String(c.owner_id) : 'not_provided'),
          created_at: c.created_at || c.createdAt || null,
        };
        const k = clubRowKey(row);
        row.status = statusOverrideRef.current[k] || pickClubStatusFromApi(row, null);
        return row;
      });

      const enriched = await Promise.all(
        normalizedBase.map(async (club) => {
          const k = clubRowKey(club);
          if (club.created_by !== 'not_provided' && club.created_at) {
            return statusOverrideRef.current[k] ? { ...club, status: statusOverrideRef.current[k] } : club;
          }
          try {
            const detail = await adminApi.getClub(club.slug || club.id);
            const ownerId = detail?.owner_id || detail?.created_by_id;
            const merged = {
              ...club,
              created_by:
                club.created_by !== 'not_provided'
                  ? club.created_by
                  : detail?.created_by ||
                    detail?.owner_username ||
                    detail?.created_by_username ||
                    userNameById.get(ownerId) ||
                    (ownerId ? String(ownerId) : 'not_provided'),
              created_at: club.created_at || detail?.created_at || detail?.createdAt || null,
              status:
                statusOverrideRef.current[k] ||
                pickClubStatusFromApi(club, detail),
            };
            return merged;
          } catch {
            if (statusOverrideRef.current[k]) return { ...club, status: statusOverrideRef.current[k] };
            return club;
          }
        })
      );

      setClubs(enriched);
    } catch (err) {
      showToast(err.message || 'Failed to load clubs', 'error');
      setClubs([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadClubs(); }, [loadClubs]);

  async function handleCreateClub() {
    try {
      await adminApi.createClub(newClub);
      showToast('Club created!');
      setShowCreateModal(false);
      setNewClub({ name: '', slug: '', description: '', privacy: 'public' });
      loadClubs();
    } catch (err) {
      showToast(err.message || 'Failed to create club', 'error');
      setShowCreateModal(false);
    }
  }

  async function openClubPosts(club) {
    setLoadingPosts(true);
    setPostsModal(club);
    try {
      const res = await adminApi.getClubPosts(club.slug || club.id);
      const posts = Array.isArray(res) ? res : (res?.posts || []);
      setClubPosts(posts.map(p => ({
        ...p,
        id: p.id || p.post_id,
        title: p.title || p.content?.substring(0, 60) || '(untitled)',
        author: p.author || p.username || p.user?.username || 'unknown',
        likes_count: p.likes_count ?? p.likes ?? 0,
        comments_count: p.comments_count ?? p.comment_count ?? 0,
        is_pinned: p.is_pinned || false,
        is_highlighted: p.is_highlighted || false,
        created_at: p.created_at || p.createdAt || null,
      })));
    } catch (err) {
      showToast(err.message || 'Failed to load club posts', 'error');
      setClubPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }

  // --- Delete club ---
  async function handleDeleteClub() {
    if (!confirmAction?.club) return;
    const k = clubRowKey(confirmAction.club);
    try {
      await adminApi.deleteClub(confirmAction.club);
      delete statusOverrideRef.current[k];
      showToast('Club deleted');
      loadClubs();
    } catch (err) {
      const msg = formatAdminApiError(err);
      if (msg.includes('Cannot DELETE') || msg.includes('404') || msg.includes('405')) {
        showToast('Club deletion failed for all id variants (UUID/slug). Backend must implement DELETE /admin/clubs/:id or DELETE /clubs/:id for admins.', 'error');
      } else {
        showToast(msg || 'Failed to delete club', 'error');
      }
    }
    setConfirmAction(null);
  }

  // --- Suspend club ---
  async function handleSuspendClub() {
    if (!confirmAction?.club) return;
    const club = confirmAction.club;
    const k = clubRowKey(club);
    try {
      await adminApi.suspendClub(club);
      statusOverrideRef.current[k] = 'suspended';
      showToast('Club suspended');
      loadClubs();
    } catch (err) {
      delete statusOverrideRef.current[k];
      showToast(formatAdminApiError(err) || 'Failed to suspend club', 'error');
    }
    setConfirmAction(null);
  }

  // --- Activate club (after suspend) ---
  async function handleActivateClub() {
    if (!confirmAction?.club) return;
    const club = confirmAction.club;
    const k = clubRowKey(club);
    try {
      await adminApi.activateClub(club);
      statusOverrideRef.current[k] = 'active';
      showToast('Club activated');
      loadClubs();
    } catch (err) {
      showToast(formatAdminApiError(err) || 'Failed to activate club', 'error');
    }
    setConfirmAction(null);
  }

  // --- Transfer ownership ---
  async function handleTransferOwnership() {
    if (!transferModal || !newOwnerId.trim()) return;
    try {
      await adminApi.transferClubOwnership(transferModal.id || transferModal.slug, newOwnerId.trim());
      showToast('Ownership transferred');
      setTransferModal(null);
      setNewOwnerId('');
      loadClubs();
    } catch (err) {
      showToast(formatAdminApiError(err) || 'Failed to transfer ownership', 'error');
    }
  }

  // --- Pin / Highlight post — NOT supported by backend ---
  async function togglePin(post) {
    showToast('Pin/unpin club posts is not supported by the backend API.', 'error');
  }

  async function toggleHighlight(post) {
    showToast('Highlight club posts is not supported by the backend API.', 'error');
  }

  return (
    <div id="clubs-page">
      <div className="page-actions-bar">
        <div />
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} id="create-club-btn">
          + Create Official Club
        </button>
      </div>

      <DataTable
        id="clubs-table"
        columns={[
          { header: 'Club Name', render: (r) => <strong>{r.name}</strong> },
          { header: 'Type', render: (r) => <StatusBadge status={r.privacy} /> },
          { header: 'Members', accessor: 'members_count' },
          { header: 'Created By', render: (r) => `@${r.created_by || 'not_provided'}` },
          { header: 'Created', render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : '—') },
          { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        data={clubs}
        loading={loading}
        actions={(row) => (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openClubPosts(row)}>Posts</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setTransferModal(row); setNewOwnerId(''); }}>Transfer</button>
            {row.status !== 'suspended' && (
              <button className="btn btn-warning btn-sm" onClick={() => setConfirmAction({ type: 'suspend', club: row })}>Suspend</button>
            )}
            {row.status === 'suspended' && (
              <button className="btn btn-success btn-sm" onClick={() => setConfirmAction({ type: 'activate', club: row })}>Activate</button>
            )}
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmAction({ type: 'delete', club: row })}>Delete</button>
          </div>
        )}
      />

      {/* Create Club Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Official Club"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateClub} disabled={!newClub.name.trim()}>Create Club</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Club Name</label>
          <input className="form-input" value={newClub.name} onChange={e => setNewClub({ ...newClub, name: e.target.value })} placeholder="e.g. Enarv Official" />
        </div>
        <div className="form-group">
          <label className="form-label">Slug (optional)</label>
          <input className="form-input" value={newClub.slug} onChange={e => setNewClub({ ...newClub, slug: e.target.value })} placeholder="Leave blank to auto-generate from name" />
          <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '6px' }}>
            If empty, the API derives a URL slug from the club name (same as <code>adminApi.createClub</code>).
          </p>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={newClub.description} onChange={e => setNewClub({ ...newClub, description: e.target.value })} placeholder="Club description..." />
        </div>
        <div className="form-group">
          <label className="form-label">Privacy</label>
          <select className="form-select" value={newClub.privacy} onChange={e => setNewClub({ ...newClub, privacy: e.target.value })}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </Modal>

      {/* Confirm Delete/Suspend Modal */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.type === 'delete'
            ? 'Delete Club'
            : confirmAction?.type === 'activate'
              ? 'Activate Club'
              : 'Suspend Club'
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
            <button
              className={`btn ${
                confirmAction?.type === 'delete'
                  ? 'btn-danger'
                  : confirmAction?.type === 'activate'
                    ? 'btn-success'
                    : 'btn-warning'
              }`}
              onClick={
                confirmAction?.type === 'delete'
                  ? handleDeleteClub
                  : confirmAction?.type === 'activate'
                    ? handleActivateClub
                    : handleSuspendClub
              }
            >
              {confirmAction?.type === 'delete'
                ? 'Delete Club'
                : confirmAction?.type === 'activate'
                  ? 'Activate Club'
                  : 'Suspend Club'}
            </button>
          </>
        }
      >
        <div className="confirm-dialog-text">
          <div
            className={`confirm-dialog-icon ${
              confirmAction?.type === 'delete' ? 'danger' : confirmAction?.type === 'activate' ? '' : ''
            }`}
          >
            {confirmAction?.type === 'delete' ? '🗑️' : confirmAction?.type === 'activate' ? '✓' : '⏸️'}
          </div>
          <h3>
            {confirmAction?.type === 'delete'
              ? 'Delete'
              : confirmAction?.type === 'activate'
                ? 'Activate'
                : 'Suspend'}{' '}
            Club?
          </h3>
          <p>
            Are you sure you want to{' '}
            {confirmAction?.type === 'delete' ? 'delete' : confirmAction?.type === 'activate' ? 'reactivate' : 'suspend'}{' '}
            <strong>{confirmAction?.club?.name}</strong>?
            {confirmAction?.type === 'delete'
              ? ' This action cannot be undone.'
              : confirmAction?.type === 'activate'
                ? ' The club will be visible to members again.'
                : ' The club and its content will be hidden from members.'}
          </p>
        </div>
      </Modal>

      {/* Transfer Ownership Modal */}
      <Modal
        isOpen={!!transferModal}
        onClose={() => setTransferModal(null)}
        title={`Transfer Ownership: ${transferModal?.name || ''}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setTransferModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleTransferOwnership} disabled={!newOwnerId.trim()}>Transfer</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Current Owner: <strong>@{transferModal?.created_by || '—'}</strong></label>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-label">New Owner User ID</label>
            <input
              className="form-input"
              value={newOwnerId}
              onChange={e => setNewOwnerId(e.target.value)}
              placeholder="Enter the new owner's user ID"
            />
          </div>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
            You can find user IDs on the Users page.
          </div>
        </div>
      </Modal>

      {/* Club Posts Modal — Pin / Highlight */}
      <Modal
        isOpen={!!postsModal}
        onClose={() => setPostsModal(null)}
        title={`Posts — ${postsModal?.name || ''}`}
        maxWidth="780px"
      >
        {loadingPosts ? (
          <div className="loading-page" style={{ minHeight: 120 }}><div className="loading-spinner" /></div>
        ) : clubPosts.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">No posts in this club</div></div>
        ) : (
          <div>
            {clubPosts.map(post => (
              <div key={post.id} style={{
                padding: 'var(--space-3)', marginBottom: 'var(--space-2)',
                background: 'var(--bg-glass)',
                border: `1px solid var(--border-subtle)`,
                borderRadius: '10px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                      {post.title || '(untitled)'}
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                      @{post.author} · {post.likes_count}♥ {post.comments_count}💬 · {post.created_at ? new Date(post.created_at).toLocaleDateString() : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
