'use client';

import { useState, useEffect, useCallback } from 'react';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { adminApi, formatAdminApiError } from '@/lib/api';
import Link from 'next/link';

const columns = [
  { header: 'ID', accessor: 'id', cellStyle: { fontFamily: 'monospace', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' } },
  { header: 'Name', render: (row) => (
    <Link href={`/users/detail?id=${encodeURIComponent(row.id)}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
      {row.full_name}
    </Link>
  )},
  { header: 'Username', render: (row) => <span style={{ color: 'var(--text-secondary)' }}>@{row.username}</span> },
  { header: 'Email', accessor: 'email', cellStyle: { color: 'var(--text-secondary)' } },
  { header: 'Followers', accessor: 'followers_count' },
  { header: 'Following', accessor: 'following_count' },
  { header: 'Circles', accessor: 'reading_circle_count' },
  { header: 'Joined', render: (row) => new Date(row.created_at).toLocaleDateString() },
  { header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
];

const accountRoles = [
  { value: 'user', label: 'Regular User', desc: 'Standard platform user' },
  { value: 'enarv_official', label: 'Enarv Official', desc: 'Official Enarv account (verified badge)' },
  { value: 'super_account', label: 'Super Account', desc: 'Can seed conversations and moderate' },
];

export default function UsersPage() {
  const showToast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [actionModal, setActionModal] = useState(null);
  const [roleModal, setRoleModal] = useState(null);
  const [selectedRole, setSelectedRole] = useState('user');
  const PAGE_SIZE = 50;

  const buildUsersParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String((page - 1) * PAGE_SIZE));
    if (search.trim()) params.set('q', search.trim().replace(/^@/, ''));
    return params.toString();
  }, [PAGE_SIZE, page, search]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getUsers(buildUsersParams());
      const userList = res.users || [];
      const normalized = userList.map((u) => ({
        ...u,
        id: u.id || u.user_id || u._id,
        full_name: u.full_name || u.name || u.display_name || u.username || 'User',
        username: u.username || u.user_name || 'unknown',
        email: u.email || u.email_address || '—',
        followers_count: u.followers_count ?? u.follower_count ?? 0,
        following_count: u.following_count ?? u.following_count ?? 0,
        reading_circle_count: u.reading_circle_count ?? u.circles_count ?? 0,
        status: u.status || u.account_status || 'active',
        created_at: u.created_at || u.createdAt || null,
        avatar: u.avatar || u.avatar_url || u.profile_pic || '',
      }));
      setUsers(normalized);
      setTotalCount(Number(res.total) || normalized.length);
      if (normalized.length === 0 && !search) setError('No users found in database');
    } catch (err) {
      setUsers([]);
      setTotalCount(0);
      setError(formatAdminApiError(err) || 'Failed to fetch users from backend');
      showToast(formatAdminApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [buildUsersParams, search, showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleAction(userId, action) {
    try {
      if (action === 'suspend') {
        await adminApi.updateUserStatus(userId, 'suspended');
        showToast('User suspended');
      } else if (action === 'ban') {
        await adminApi.updateUserStatus(userId, 'banned');
        showToast('User banned');
      } else if (action === 'activate') {
        await adminApi.updateUserStatus(userId, 'active');
        showToast('User activated');
      } else if (action === 'delete') {
        await adminApi.deleteUser(userId);
        showToast('User deleted');
      }
      loadUsers();
    } catch (err) {
      showToast(formatAdminApiError(err), 'error');
    }
    setActionModal(null);
  }

  async function handleSetRole() {
    if (!roleModal) return;
    try {
      await adminApi.updateUserPermissions(roleModal.id, selectedRole);
      showToast(`Role updated to ${selectedRole}`);
      loadUsers();
    } catch (err) {
      showToast(err.message || 'User role management is not available on the backend.', 'error');
    }
    setRoleModal(null);
  }

  async function handleFindUser(username) {
    setPage(1);
    setSearch((username || '').trim());
  }

  return (
    <div id="users-page">
      {error && <div className="demo-badge"><span>⚠️ {error}</span></div>}
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Manage all registered users on the platform</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="search-input-wrapper" style={{ width: '300px' }}>
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="form-input"
              placeholder="Find by username (e.g. @fburger693)..."
              defaultValue={search}
              onKeyDown={(e) => e.key === 'Enter' && handleFindUser(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
          </div>
          <button className="btn btn-secondary" onClick={loadUsers}>Refresh List</button>
        </div>
      </div>

      <DataTable
        id="users-table"
        columns={[
          ...columns,
          { header: 'Role', render: (row) => {
            const role = row.role || 'user';
            const color = role === 'enarv_official' ? 'var(--accent-primary)' : role === 'super_account' ? 'var(--status-warning)' : 'var(--text-muted)';
            return <span className="chip" style={{ borderColor: color, color }}>{role.replace(/_/g, ' ')}</span>;
          }},
        ]}
        data={users}
        loading={loading}
        currentPage={page}
        onPageChange={setPage}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        onSearch={(val) => handleFindUser(val)}
        emptyMessage="No users found"
        emptyIcon="👤"
        actions={(row) => (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {row.id ? (
              <Link href={`/users/detail?id=${encodeURIComponent(row.id)}`} className="btn btn-ghost btn-sm">View</Link>
            ) : (
              <span className="btn btn-ghost btn-sm" style={{ opacity: 0.5, pointerEvents: 'none' }}>View</span>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setRoleModal(row);
                setSelectedRole(row.role || 'user');
              }}
              title="Set account role"
            >
              Set Role
            </button>
            {row.status === 'active' && (
              <button className="btn btn-warning btn-sm" onClick={() => setActionModal({ user: row, action: 'suspend' })}>
                Suspend
              </button>
            )}
            {row.status !== 'banned' && (
              <button className="btn btn-danger btn-sm" onClick={() => setActionModal({ user: row, action: 'ban' })}>
                Ban
              </button>
            )}
            {row.status !== 'active' && (
              <button className="btn btn-success btn-sm" onClick={() => setActionModal({ user: row, action: 'activate' })}>
                Activate
              </button>
            )}
            <button className="btn btn-danger btn-sm" onClick={() => setActionModal({ user: row, action: 'delete' })}>
              Delete
            </button>
          </div>
        )}
      />

      <Modal
        isOpen={!!actionModal}
        onClose={() => setActionModal(null)}
        title="Confirm Action"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
            <button
              className={`btn ${actionModal?.action === 'activate' ? 'btn-success' : 'btn-danger'}`}
              onClick={() => handleAction(actionModal.user.id, actionModal.action)}
            >
              {actionModal?.action === 'suspend' ? 'Suspend User' : actionModal?.action === 'ban' ? 'Ban User' : actionModal?.action === 'delete' ? 'Delete User' : 'Activate User'}
            </button>
          </>
        }
      >
        <div className="confirm-dialog-text">
          <div className={`confirm-dialog-icon ${actionModal?.action === 'activate' ? '' : 'danger'}`}>
            {actionModal?.action === 'suspend' ? '⚠️' : actionModal?.action === 'ban' ? '🚫' : '✓'}
          </div>
          <h3>{actionModal?.action === 'suspend' ? 'Suspend' : actionModal?.action === 'ban' ? 'Ban' : 'Activate'} User?</h3>
          <p>Are you sure you want to {actionModal?.action} <strong>{actionModal?.user?.full_name}</strong>?</p>
        </div>
      </Modal>

      <Modal
        isOpen={!!roleModal}
        onClose={() => setRoleModal(null)}
        title="Set Account Role"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRoleModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSetRole}>Update Role</button>
          </>
        }
      >
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Set special permissions for <strong>{roleModal?.full_name}</strong> (@{roleModal?.username})</p>
        </div>
        {accountRoles.map(r => (
          <label key={r.value} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-3)', marginBottom: 'var(--space-2)',
            background: selectedRole === r.value ? 'var(--accent-primary-glow)' : 'var(--bg-glass)',
            border: `1px solid ${selectedRole === r.value ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
            borderRadius: '8px', cursor: 'pointer',
          }}>
            <input type="radio" name="role" value={r.value} checked={selectedRole === r.value}
              onChange={() => setSelectedRole(r.value)} style={{ accentColor: 'var(--accent-primary)' }} />
            <div>
              <div style={{ fontWeight: 600 }}>{r.label}</div>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{r.desc}</div>
            </div>
          </label>
        ))}
      </Modal>
    </div>
  );
}
