'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import DataTable from '@/components/DataTable';
import { adminApi } from '@/lib/api';

function UserDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('id');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts');

  useEffect(() => {
    async function load() {
      if (!userId) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const usersRes = await adminApi.getUsers('limit=500').catch(() => null);
        const users = usersRes?.users || (Array.isArray(usersRes) ? usersRes : []);
        let userData = users.find((u) => (u.id || u.user_id) === userId);
        if (!userData) {
          setUser(null);
          return;
        }
        userData = {
          ...userData,
          id: userData.id || userData.user_id,
          full_name: userData.full_name || userData.name || userData.username || 'User',
          status: userData.status || userData.account_status || 'active',
          created_at: userData.created_at || userData.createdAt || null,
        };
        if (userData?.username) {
          const [profile, posts, clubs] = await Promise.all([
            adminApi.getUserProfile(userData.username).catch(() => null),
            adminApi.getUserPosts(userData.username).catch(() => []),
            adminApi.getUserClubs(userData.username).catch(() => []),
          ]);
          if (profile) userData = { ...userData, ...profile };
          userData.posts = Array.isArray(posts) ? posts : (posts?.posts || []);
          userData.clubs = Array.isArray(clubs) ? clubs : (clubs?.clubs || []);
        }
        setUser(userData);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;
  if (!user) return <div className="empty-state"><div className="empty-state-text">User not found</div></div>;

  const tabs = ['posts', 'comments', 'clubs', 'orders', 'referrals'];
  return (
    <div id="user-detail-page">
      <div className="back-nav" onClick={() => router.back()} id="back-to-users" style={{ marginBottom: 'var(--space-4)' }}>
        <span>←</span> Back to Users
      </div>
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="user-profile-header">
          <div className="user-avatar-lg">{user.full_name?.charAt(0)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 600, margin: 0 }}>{user.full_name}</h2>
              <StatusBadge status={user.status} />
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-base)' }}>{user.email}</p>
            {user.bio && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: 'var(--space-2)' }}>{user.bio}</p>}
            <div className="user-stats">
              <div className="user-stat"><div className="user-stat-value">{user.followers_count}</div><div className="user-stat-label">Followers</div></div>
              <div className="user-stat"><div className="user-stat-value">{user.following_count}</div><div className="user-stat-label">Following</div></div>
              <div className="user-stat"><div className="user-stat-value">{user.reading_circle_count}</div><div className="user-stat-label">Circles</div></div>
              <div className="user-stat"><div className="user-stat-value">{user.referral_count || 0}</div><div className="user-stat-label">Referrals</div></div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)', marginTop: 'var(--space-3)' }}>
              Joined {user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not provided'}
            </p>
          </div>
        </div>
      </div>
      <div className="tabs">{tabs.map((tab) => <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}</div>

      {activeTab === 'posts' && <DataTable id="user-posts" columns={[
        { header: 'Title', accessor: 'title' }, { header: 'Likes', accessor: 'likes_count' }, { header: 'Comments', accessor: 'comments_count' }, { header: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
      ]} data={user.posts || []} searchable={false} emptyMessage="No posts yet" />}

      {activeTab === 'comments' && <DataTable id="user-comments" columns={[
        { header: 'Comment', accessor: 'content' }, { header: 'On Post', accessor: 'post_title' }, { header: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
      ]} data={user.comments || []} searchable={false} emptyMessage="No comments yet" />}

      {activeTab === 'clubs' && <DataTable id="user-clubs" columns={[
        { header: 'Club', accessor: 'name' }, { header: 'Members', accessor: 'members_count' }, { header: 'Role', render: (r) => <StatusBadge status={r.role} /> },
      ]} data={user.clubs || []} searchable={false} emptyMessage="Not in any clubs" />}

      {activeTab === 'orders' && <DataTable id="user-orders" columns={[
        { header: 'Order ID', accessor: 'id', cellStyle: { fontFamily: 'monospace' } }, { header: 'Amount', render: (r) => `₹${r.amount?.toLocaleString()}` }, { header: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { header: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
      ]} data={user.orders || []} searchable={false} emptyMessage="No orders yet" />}

      {activeTab === 'referrals' && <div className="card"><div className="card-header"><h3 className="card-title">Referral Stats</h3></div><div style={{ display: 'flex', gap: 'var(--space-8)', padding: 'var(--space-4)' }}><div className="user-stat"><div className="user-stat-value">{user.referral_count || 0}</div><div className="user-stat-label">Total Referrals</div></div></div></div>}
    </div>
  );
}

export default function UserDetailPage() {
  return (
    <Suspense fallback={<div className="loading-page"><div className="loading-spinner" /></div>}>
      <UserDetailContent />
    </Suspense>
  );
}
