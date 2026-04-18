'use client';

import { useState, useEffect } from 'react';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { adminApi } from '@/lib/api';

function normalizeTicket(item) {
  return {
    ...item,
    id: item.id || item.ticket_id,
    user: item.user || item.username || item.user_name || item.user?.username || item.account?.username || 'unknown',
    subject: item.subject || item.title || item.issue || 'No subject',
    category: item.category || item.type || 'general',
    status: item.status || 'open',
    created_at: item.created_at || item.createdAt || null,
    description: item.description || item.message || item.details || '',
    replies: Array.isArray(item.replies) ? item.replies : Array.isArray(item.messages) ? item.messages : [],
  };
}

export default function SupportPage() {
  const showToast = useToast();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    adminApi
      .getTickets()
      .then((r) => {
        const list = Array.isArray(r) ? r : (r?.tickets || r?.items || []);
        setTickets(list.map(normalizeTicket));
      })
      .catch((err) => {
        showToast(err.message || 'Failed to load support tickets', 'error');
        setTickets([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

  async function sendReply() {
    if (!reply.trim()) return;
    try {
      await adminApi.updateTicket(selected.id, {
        status: selected.status,
        admin_response: reply,
      });
    } catch (err) {
      showToast(err.message || 'Failed to send reply', 'error');
      return;
    }
    const newReply = { from: 'admin', message: reply, created_at: new Date().toISOString() };
    setTickets(p => p.map(t => t.id === selected.id ? { ...t, replies: [...(t.replies||[]), newReply] } : t));
    setSelected(p => ({ ...p, replies: [...(p.replies||[]), newReply] }));
    setReply('');
    showToast('Reply sent');
  }

  async function changeStatus(id, status) {
    try {
      await adminApi.updateTicket(id, { status });
    } catch (err) {
      showToast(err.message || 'Failed to update ticket status', 'error');
      return;
    }
    setTickets(p => p.map(t => t.id === id ? { ...t, status } : t));
    if (selected?.id === id) setSelected(p => ({ ...p, status }));
    showToast('Status updated');
  }

  return (
    <div id="support-page">
      <div className="page-header">
        <div><h1 className="page-title">Support Tickets</h1><p className="page-subtitle">Manage customer support</p></div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['all','open','in_progress','closed'].map(s => (
            <button key={s} className={`btn btn-sm ${filter===s?'btn-primary':'btn-ghost'}`} onClick={() => setFilter(s)}>{s==='all'?'All':s.replace(/_/g,' ')}</button>
          ))}
        </div>
      </div>
      <DataTable id="tickets-table" columns={[
        { header: 'ID', accessor: 'id', cellStyle: { fontFamily: 'monospace', fontSize: 'var(--font-xs)' } },
        { header: 'User', render: r => `@${r.user || 'unknown'}` },
        { header: 'Subject', render: r => <strong>{r.subject}</strong> },
        { header: 'Category', render: r => <span className="chip">{r.category}</span> },
        { header: 'Status', render: r => <StatusBadge status={r.status} /> },
        { header: 'Date', render: r => (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Not provided') },
      ]} data={filtered} loading={loading} actions={row => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(row)}>View</button>
          {row.status==='open' && <button className="btn btn-warning btn-sm" onClick={() => changeStatus(row.id,'in_progress')}>In Progress</button>}
          {row.status!=='closed' && <button className="btn btn-success btn-sm" onClick={() => changeStatus(row.id,'closed')}>Close</button>}
        </div>
      )} />
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.subject} maxWidth="640px">
        {selected && (<div>
          <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
            <span className="chip">@{selected.user || 'unknown'}</span><span className="chip">{selected.category}</span><StatusBadge status={selected.status} />
          </div>
          <div style={{ padding:'16px', background:'var(--bg-glass)', borderRadius:'10px', marginBottom:'16px' }}><p>{selected.description}</p></div>
          {selected.replies?.map((r, i) => (
            <div key={i} style={{ padding:'12px 16px', background: r.from==='admin'?'var(--accent-primary-glow)':'var(--bg-glass)', borderRadius:'10px', marginBottom:'8px', borderLeft: r.from==='admin'?'3px solid var(--accent-primary)':'3px solid var(--border-primary)' }}>
              <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>{r.from==='admin'?'🛡️ Admin':`@${selected.user || 'unknown'}`} · {r.created_at ? new Date(r.created_at).toLocaleString() : 'Not provided'}</div>
              <p style={{ fontSize:'14px' }}>{r.message}</p>
            </div>
          ))}
          {selected.status!=='closed' && (<div style={{ marginTop:'16px' }}>
            <textarea className="form-textarea" value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply..." style={{ minHeight:'80px' }} />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'8px' }}>
              <button className="btn btn-primary" onClick={sendReply} disabled={!reply.trim()}>Send Reply</button>
            </div>
          </div>)}
        </div>)}
      </Modal>
    </div>
  );
}
