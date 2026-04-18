'use client';

import { useState, useEffect } from 'react';
import DataTable from '@/components/DataTable';
import { adminApi } from '@/lib/api';

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCircle, setTotalCircle] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        // Fetch ALL users to build platform-wide referral data
        const usersRes = await adminApi.getUsers('limit=500');
        const users = usersRes?.users || (Array.isArray(usersRes) ? usersRes : []);

        const userById = {};
        users.forEach(u => {
          const id = u.id || u.user_id;
          if (id) userById[id] = u;
        });

        // Build referral pairs from users who have referred_by set
        const referralPairs = [];
        const referrerCounts = {};

        users.forEach(u => {
          const referredBy = u.referred_by || u.referredBy || u.referrer_id || u.referrerId;
          if (referredBy) {
            const referrer = userById[referredBy];
            referralPairs.push({
              id: u.id || u.user_id || u.username,
              referrer_id: referredBy,
              referrer: referrer?.username || referrer?.full_name || String(referredBy).slice(0, 8) + '…',
              referred: u.username || u.full_name || 'unknown',
              referred_name: u.full_name || u.username || 'Unknown',
              status: 'completed',
              created_at: u.created_at || u.createdAt || new Date().toISOString(),
            });
            referrerCounts[referredBy] = (referrerCounts[referredBy] || 0) + 1;
          }
        });

        setReferrals(referralPairs);

        // Build leaderboard sorted by referral count
        const board = Object.entries(referrerCounts)
          .map(([userId, count]) => {
            const user = userById[userId];
            return {
              username: user?.username || String(userId).slice(0, 8) + '…',
              full_name: user?.full_name || user?.username || 'User',
              referral_count: count,
              reading_circle: user?.reading_circle_count ?? user?.circles_count ?? 0,
            };
          })
          .sort((a, b) => b.referral_count - a.referral_count)
          .slice(0, 10);

        setLeaderboard(board);

        // Compute total reading circle
        const totalRC = users.reduce((sum, u) => sum + (u.reading_circle_count ?? u.circles_count ?? 0), 0);
        setTotalCircle(totalRC);

        // Also try the admin's own referral stats to supplement
        try {
          const myStats = await adminApi.getMyReferralStats();
          const myReferred = await adminApi.getMyReferredUsers();
          const myList = Array.isArray(myReferred) ? myReferred : (myReferred?.users || myReferred?.items || []);

          // Add admin's referrals if they weren't already captured
          myList.forEach(u => {
            const exists = referralPairs.some(r => r.id === (u.user_id || u.id));
            if (!exists) {
              referralPairs.push({
                id: u.user_id || u.id || u.username,
                referrer_id: 'admin',
                referrer: 'admin',
                referred: u.username || 'unknown',
                referred_name: u.full_name || u.username || 'Unknown',
                status: 'completed',
                created_at: u.joined_at || u.created_at || new Date().toISOString(),
              });
            }
          });

          if (myList.length > 0) {
            setReferrals([...referralPairs]);
          }
        } catch {
          // Admin referral stats not available, continue
        }
      } catch {
        setReferrals([]);
        setLeaderboard([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div id="referrals-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Referrals</h1>
          <p className="page-subtitle">Track platform-wide referral activity</p>
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Leaderboard */}
        <div className="card" id="leaderboard">
          <div className="card-header">
            <h3 className="card-title">🏆 Top Referrers</h3>
            <span className="chip">{leaderboard.length} users</span>
          </div>
          {leaderboard.length === 0 && !loading ? (
            <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
              No referral data found. Users with the <code>referred_by</code> field will appear here.
            </div>
          ) : (
            leaderboard.map((user, i) => (
              <div className="activity-item" key={user.username}>
                <div className="activity-avatar" style={{
                  background: i === 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : i === 1 ? 'linear-gradient(135deg, #94a3b8, #64748b)' : i === 2 ? 'linear-gradient(135deg, #b45309, #92400e)' : 'var(--accent-primary-glow)',
                  color: i < 3 ? 'white' : 'var(--accent-primary-hover)'
                }}>
                  {i + 1}
                </div>
                <div className="activity-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="activity-text"><strong>{user.full_name}</strong></div>
                    <div className="activity-time">@{user.username} · Circle: {user.reading_circle}</div>
                  </div>
                  <div style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--metric-referrals)' }}>
                    {user.referral_count}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats Summary */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">📊 Summary</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', padding: 'var(--space-4)' }}>
            <div className="user-stat">
              <div className="user-stat-value" style={{ color: 'var(--metric-referrals)' }}>{referrals.length}</div>
              <div className="user-stat-label">Total Referrals</div>
            </div>
            <div className="user-stat">
              <div className="user-stat-value" style={{ color: 'var(--status-success)' }}>{referrals.filter(r => r.status === 'completed').length}</div>
              <div className="user-stat-label">Completed</div>
            </div>
            <div className="user-stat">
              <div className="user-stat-value" style={{ color: 'var(--status-warning)' }}>{referrals.filter(r => r.status === 'pending').length}</div>
              <div className="user-stat-label">Pending</div>
            </div>
            <div className="user-stat">
              <div className="user-stat-value">{leaderboard[0]?.referral_count || 0}</div>
              <div className="user-stat-label">Top Referrer Count</div>
            </div>
          </div>
        </div>
      </div>

      <DataTable
        id="referrals-table"
        title="Referral History"
        columns={[
          { header: 'Referrer', render: (r) => <strong>@{r.referrer}</strong> },
          { header: 'Referred User', render: (r) => `${r.referred_name} (@${r.referred})` },
          { header: 'Status', render: (r) => <span className={`badge badge-${r.status === 'completed' ? 'success' : 'warning'}`}>{r.status}</span> },
          { header: 'Date', render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
        ]}
        data={referrals}
        loading={loading}
        emptyMessage="No referral data available"
        emptyIcon="🔗"
      />
    </div>
  );
}
