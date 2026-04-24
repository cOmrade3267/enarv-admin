'use client';

import { useState, useEffect } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { adminApi } from '@/lib/api';

const LOCAL_HISTORY_KEY = 'admin_notification_history';

export default function NotificationsPage() {
  const showToast = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [targetIds, setTargetIds] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    const localHistory = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]')
      : [];
    try {
      const res = await adminApi.getNotificationHistory();
      const list = res.notifications || (Array.isArray(res) ? res : []);
      setHistory(list.length > 0 ? list : localHistory);
    } catch {
      setHistory(localHistory);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      showToast('Title and message are required', 'error');
      return;
    }
    setSending(true);
    let status = 'sent';
    let recipientCount = targetType === 'all' ? 0 : 1; 
    let errorMsg = null;
    try {
      const payload = { 
        title, 
        message, 
        targetGroup: targetType === 'specific' ? 'specific_users' : (targetType === 'club' ? 'club_members' : 'all'),
        link: link.trim() || undefined,
        image_url: imageUrl.trim() || undefined
      };
      
      if (targetType === 'specific' && targetIds.trim()) {
        payload.specificUserId = targetIds.trim();
      }
      if (targetType === 'club' && targetIds.trim()) {
        payload.clubId = targetIds.trim();
      }
      
      const res = await adminApi.sendNotification(payload);
      recipientCount = res.recipients || recipientCount;
      showToast('Notification sent!');
    } catch (err) {
      status = 'failed';
      errorMsg = err.message || 'Send failed';
      showToast(err.message || 'Notification send failed', 'error');
    }
    const entry = {
      id: Date.now(), title, message, targetType, status,
      sentAt: new Date().toISOString(),
      count: typeof recipientCount === 'number' ? recipientCount : 0,
      error: errorMsg,
    };
    setHistory(prev => {
      const updated = [entry, ...prev];
      if (typeof window !== 'undefined') localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
    setTitle(''); setMessage(''); setTargetIds(''); setLink(''); setImageUrl('');
    setSending(false);
  }

  return (
    <div id="notifications-page">

      <div className="two-col">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Send Notification</h3></div>
          <form onSubmit={handleSend}>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title" id="notif-title" />
            </div>
            <div className="form-group">
              <label className="form-label">Message</label>
              <textarea className="form-textarea" value={message} onChange={e => setMessage(e.target.value)} placeholder="Notification message..." id="notif-message" />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Action Link (Optional)</label>
                <input className="form-input" value={link} onChange={e => setLink(e.target.value)} placeholder="https://enarv.com/..." />
              </div>
              <div className="form-group">
                <label className="form-label">Image URL (Optional)</label>
                <input className="form-input" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Target Audience</label>
              <select className="form-select" value={targetType} onChange={e => setTargetType(e.target.value)} id="notif-target">
                <option value="all">All Users</option>
                <option value="specific">Specific User</option>
                <option value="club">Club Members</option>
              </select>
            </div>
            {targetType !== 'all' && (
              <div className="form-group">
                <label className="form-label">{targetType === 'specific' ? 'User ID' : 'Club ID'}</label>
                <input className="form-input" value={targetIds} onChange={e => setTargetIds(e.target.value)} placeholder={targetType === 'specific' ? 'Firebase UID of the user' : 'Club UUID'} />
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-lg" disabled={sending} id="send-notif-btn" style={{ width: '100%' }}>
              {sending ? 'Sending...' : '🔔 Send Notification'}
            </button>
          </form>
        </div>


        <div className="card">
          <div className="card-header"><h3 className="card-title">Notification History</h3></div>
          {loadingHistory ? (
            <div className="loading-page" style={{ minHeight: 120 }}><div className="loading-spinner" /></div>
          ) : history.length === 0 ? (
            <div className="empty-state"><div className="empty-state-text">No notifications sent yet</div></div>
          ) : (
            history.map(n => (
              <div className="activity-item" key={n.id}>
                <div className="activity-avatar" style={{
                  background: n.status === 'failed' ? 'rgba(239,68,68,0.15)' : undefined,
                  color: n.status === 'failed' ? 'var(--status-danger)' : undefined,
                }}>
                  {n.status === 'failed' ? '❌' : '🔔'}
                </div>
                <div className="activity-content" style={{ flex: 1 }}>
                  <div className="activity-text" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong>{n.title}</strong>
                    <StatusBadge status={n.status} />
                  </div>
                  <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>{n.message}</div>
                  <div className="activity-time">
                    <span className="chip" style={{ marginRight: '8px' }}>{n.targetType}</span>
                    {n.status === 'sent' && typeof n.count === 'number' ? `${n.count.toLocaleString()} recipients` : ''}
                    {n.status === 'failed' && n.error ? <span style={{ color: 'var(--status-danger)', marginLeft: '8px' }}>Error: {n.error}</span> : ''}
                    {' · '}{new Date(n.sentAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
