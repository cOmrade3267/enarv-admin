'use client';

import { useState, useEffect } from 'react';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';
import { adminApi } from '@/lib/api';

const emptyDashboard = {
  totalUsers: 0,
  usersToday: 0,
  usersThisWeek: 0,
  postsToday: 0,
  commentsToday: 0,
  activeUsersToday: 0,
  totalClubs: 0,
  activeClubs: 0,
  ordersToday: 0,
  revenueToday: 0,
  referralsToday: 0,
  latestUsers: [],
  latestPosts: [],
  latestOrders: [],
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState(emptyDashboard);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [res, usersRes] = await Promise.all([
          adminApi.getDashboard(),
          adminApi.getUsers('limit=200&offset=0').catch(() => ({ users: [] })),
        ]);
        // API response shape:
        // { metrics: { users: { total, today }, engagement: { posts_today, comments_today },
        //   clubs: { total, active }, store: { orders_today, revenue_today },
        //   referrals: { today } }, recent_activity: { signups: [...], orders: [...] } }
        const m = res?.metrics || res?.data?.metrics || res || {};
        const ra = res?.recent_activity || res?.activity || res?.data?.activity || res || {};

        // Calculate usersThisWeek from actual user data if the metric is missing
        let usersThisWeek = m.users_this_week ?? m.users?.this_week ?? m.users?.thisWeek ?? null;
        if (usersThisWeek == null || usersThisWeek === 0) {
          const userList = usersRes?.users || (Array.isArray(usersRes) ? usersRes : []);
          const weekAgo = Date.now() - 7 * 86400000;
          usersThisWeek = userList.filter(u => {
            const d = u.created_at || u.createdAt;
            return d && new Date(d).getTime() >= weekAgo;
          }).length;
        }
        
        const normalized = {
          totalUsers: m.total_users ?? m.users?.total ?? m.totalUsers ?? 0,
          usersToday: m.users_today ?? m.users?.today ?? m.new_users_today ?? 0,
          usersThisWeek,
          postsToday: m.posts_today ?? m.engagement?.posts_today ?? m.engagement?.postsToday ?? 0,
          commentsToday: m.comments_today ?? m.engagement?.comments_today ?? m.engagement?.commentsToday ?? 0,
          activeUsersToday: m.active_users ?? m.users?.active_today ?? m.activeUsers ?? 0,
          totalClubs: m.total_clubs ?? m.clubs?.total ?? m.clubsCount ?? 0,
          activeClubs: m.active_clubs ?? m.clubs?.active ?? 0,
          ordersToday: m.orders_today ?? m.store?.orders_today ?? m.sales_today ?? 0,
          revenueToday: (m.revenue_today ?? m.store?.revenue_today ?? m.revenue ?? 0) / (m.revenue > 10000 ? 100 : 1), // Handle paise
          referralsToday: m.referrals_today ?? m.referrals?.today ?? 0,
          latestUsers: (ra.signups || ra.users || ra.latest_users || []).map(u => ({
            id: u.id || u.user_id || u.username,
            full_name: u.full_name || u.name || u.username || 'User',
            username: u.username || 'unknown',
            created_at: u.created_at || u.createdAt || null,
          })),
          latestPosts: (ra.posts || ra.latest_posts || []).map(p => ({
            ...p,
            id: p.id || p.post_id,
            username: p.username || p.author || 'unknown',
          })),
          latestOrders: (ra.orders || ra.latest_orders || []).map(o => ({
            id: o.id || o.order_id,
            amount: (o.amount || o.total || 0) > 10000 ? (o.amount || o.total || 0) / 100 : (o.amount || o.total || 0),
            status: o.status || o.payment_status || 'pending',
            user: o.user?.username || o.user || o.username || '—',
            created_at: o.created_at || o.createdAt || null,
          })),
        };
        setData(normalized);
      } catch (err) {
        setData(emptyDashboard);
        setError(err.message);
      } finally {
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div id="dashboard-page">
      {error && <div className="demo-badge"><span>⚠️ {error}</span></div>}
      {/* Metric Cards */}
      <div className="metrics-grid">
        <MetricCard label="Total Users" value={data.totalUsers?.toLocaleString()} color="var(--metric-users)" />
        <MetricCard label="New Users Today" value={data.usersToday} color="var(--metric-users)" />
        <MetricCard label="Users This Week" value={data.usersThisWeek} color="var(--metric-users)" />
        <MetricCard label="Posts Today" value={data.postsToday} color="var(--metric-engagement)" />
        <MetricCard label="Comments Today" value={data.commentsToday?.toLocaleString()} color="var(--metric-engagement)" />
        <MetricCard label="Active Users" value={data.activeUsersToday?.toLocaleString()} color="var(--metric-engagement)" />
        <MetricCard label="Total Clubs" value={data.totalClubs} color="var(--metric-clubs)" />
        <MetricCard label="Active Clubs" value={data.activeClubs} color="var(--metric-clubs)" />
        <MetricCard label="Orders Today" value={data.ordersToday} color="var(--metric-orders)" />
        <MetricCard label="Revenue Today" value={`₹${(data.revenueToday || 0).toLocaleString()}`} color="var(--metric-revenue)" />
        <MetricCard label="Referrals Today" value={data.referralsToday} color="var(--metric-referrals)" />
      </div>

      {/* Activity Feeds */}
      <div className="content-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {/* Latest Users */}
        <div className="card" id="latest-users">
          <div className="card-header">
            <h3 className="card-title">Recent Signups</h3>
            <span className="chip">{data.usersToday} today</span>
          </div>
          {data.latestUsers?.map((user) => (
            <div className="activity-item" key={user.id}>
              <div className="activity-avatar">{user.full_name?.charAt(0) || 'U'}</div>
              <div className="activity-content">
                <div className="activity-text">
                  <strong>{user.full_name}</strong>
                </div>
                <div className="activity-time">@{user.username} · {timeAgo(user.created_at)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Latest Posts */}
        <div className="card" id="latest-posts">
          <div className="card-header">
            <h3 className="card-title">Recent Posts</h3>
            <span className="chip">{data.postsToday} today</span>
          </div>
          {data.latestPosts?.map((post) => (
            <div className="activity-item" key={post.id}>
              <div className="activity-avatar">P</div>
              <div className="activity-content">
                <div className="activity-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {post.title || post.content?.substring(0, 60)}
                </div>
                <div className="activity-time">@{post.username} · {post.likes_count} Likes · {timeAgo(post.created_at)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Latest Orders */}
        <div className="card" id="latest-orders">
          <div className="card-header">
            <h3 className="card-title">Recent Orders</h3>
            <span className="chip">{data.ordersToday} today</span>
          </div>
          {data.latestOrders?.map((order) => (
            <div className="activity-item" key={order.id}>
              <div className="activity-avatar">O</div>
              <div className="activity-content">
                <div className="activity-text">
                  <strong>{order.id}</strong> — ₹{order.amount?.toLocaleString()}
                </div>
                <div className="activity-time" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  @{order.user} · {timeAgo(order.created_at)}
                  <StatusBadge status={order.status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
