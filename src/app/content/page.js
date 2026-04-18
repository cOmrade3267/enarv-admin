'use client';

import { useState, useEffect } from 'react';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { adminApi } from '@/lib/api';

function CountdownTimer({ endTime }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    function calc() {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Expired'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${s}s`);
    }
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  const isExpired = timeLeft === 'Expired';
  return (
    <span style={{
      fontFamily: 'monospace', fontWeight: 600, fontSize: 'var(--font-sm)',
      color: isExpired ? 'var(--status-danger)' : 'var(--status-success)',
      background: isExpired ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
      padding: '4px 10px', borderRadius: '6px',
    }}>
      {isExpired ? '⏰ Expired' : `⏳ ${timeLeft}`}
    </span>
  );
}

export default function ContentPage() {
  const showToast = useToast();
  const [tab, setTab] = useState('blogs');
  const [blogs, setBlogs] = useState([]);
  const [offers, setOffers] = useState([]);
  const [featuredAuthors, setFeaturedAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  // Featured authors
  const [addAuthorModal, setAddAuthorModal] = useState(false);
  const [authorForm, setAuthorForm] = useState({ name: '', bio: '', image_url: '' });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [b, o, fa] = await Promise.all([
        adminApi.getBlogs().catch(() => ({ blogs: [] })),
        adminApi.getDeals().catch(() => []),
        adminApi.getFeaturedAuthors().catch(() => []),
      ]);
      const blogList = b.blogs || (Array.isArray(b) ? b : []);
      const offerList = Array.isArray(o) ? o : (o?.deals || o?.items || []);
      const authorList = Array.isArray(fa) ? fa : (fa?.authors || fa?.items || fa?.data || []);
      setBlogs(blogList);
      setOffers(offerList);
      setFeaturedAuthors(authorList);
    } catch (err) {
      showToast(err.message || 'Failed to load content', 'error');
      setBlogs([]);
      setOffers([]);
      setFeaturedAuthors([]);
    } finally {
      setLoading(false);
    }
  }

  // --- Blogs ---
  function openCreateBlog() {
    setForm({ title: '', content: '', category: '', is_published: false });
    setModal({ type: 'blog', mode: 'create' });
  }
  function openEditBlog(blog) {
    setForm({ ...blog });
    setModal({ type: 'blog', mode: 'edit', id: blog.id });
  }

  // --- Limited Time Offers ---
  function openCreateOffer() {
    setForm({ book_id: '', book_title: '', discounted_price: 0, start_time: new Date().toISOString(), end_time: new Date(Date.now() + 86400000 * 3).toISOString() });
    setModal({ type: 'offer', mode: 'create' });
  }

  async function handleSave() {
    const { type, mode, id } = modal;
    try {
      if (type === 'blog') {
        if (mode === 'create') await adminApi.createBlog(form);
        else await adminApi.updateBlog(id, form);
      } else if (type === 'offer') {
        // Validate required fields for deal creation
        if (!form.book_id || !form.book_id.trim()) {
          showToast('Book ID is required to create a deal', 'error');
          return;
        }
        const price = Number(form.discounted_price);
        if (!price || price < 1) {
          showToast('Deal price must be at least 1 (in paise)', 'error');
          return;
        }
        if (!form.start_time || !form.end_time) {
          showToast('Start and end times are required', 'error');
          return;
        }
        await adminApi.createDeal({
          bookId: form.book_id.trim(),
          dealPrice: price,
          startsAt: form.start_time,
          endsAt: form.end_time,
        });
      }
      showToast(`${type} ${mode === 'create' ? 'created' : 'updated'}`);
      loadAll();
    } catch (err) {
      showToast(err.message || `${type} ${mode === 'create' ? 'create' : 'update'} failed`, 'error');
    }
    setModal(null);
  }

  async function handleDelete(type, id) {
    try {
      if (type === 'blog') await adminApi.deleteBlog(id);
      else if (type === 'offer') await adminApi.deleteDeal(id);
      showToast(`${type} deleted`);
      loadAll();
    } catch (err) {
      showToast(err.message || `${type} delete failed`, 'error');
    }
  }

  // --- Featured Authors ---
  async function handleAddFeaturedAuthor() {
    if (!authorForm.name.trim()) {
      showToast('Author name is required', 'error');
      return;
    }
    try {
      await adminApi.addFeaturedAuthor(authorForm);
      showToast('Featured author added!');
      setAddAuthorModal(false);
      setAuthorForm({ name: '', bio: '', image_url: '' });
      loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to add featured author', 'error');
    }
  }

  async function handleRemoveFeaturedAuthor(id) {
    try {
      await adminApi.removeFeaturedAuthor(id);
      showToast('Author removed from featured');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to remove featured author', 'error');
    }
  }

  const tabs = ['blogs', 'limited-time-offers', 'featured-authors'];

  return (
    <div id="content-page">
      <div className="page-header">
        <div><h1 className="page-title">Content Manager</h1><p className="page-subtitle">Manage blogs, limited time offers & featured authors</p></div>
      </div>
      <div className="tabs">
        {tabs.map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'blogs' ? '📝 Blogs' : t === 'limited-time-offers' ? '⏰ Limited Time Offers' : '✨ Featured Authors'}
            <span className="chip" style={{ marginLeft: '8px' }}>
              {t === 'blogs' ? blogs.length : t === 'limited-time-offers' ? offers.length : featuredAuthors.length}
            </span>
          </button>
        ))}
      </div>

      {/* ─── Blogs Tab ─── */}
      {tab === 'blogs' && (
        <DataTable id="blogs-table" columns={[
          { header: 'Title', render: r => <strong>{r.title}</strong> },
          { header: 'Category', render: r => <span className="chip">{r.category}</span> },
          { header: 'Status', render: r => <StatusBadge status={r.is_published ? 'published' : 'draft'} /> },
          { header: 'Read Time', render: r => `${r.read_time_minutes || '?'} min` },
          { header: 'Date', render: r => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
        ]} data={blogs} loading={loading}
          headerActions={<button className="btn btn-primary btn-sm" onClick={openCreateBlog}>+ New Blog</button>}
          actions={row => (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => openEditBlog(row)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete('blog', row.id)}>Delete</button>
            </div>
          )}
        />
      )}

      {/* ─── Limited Time Offers Tab ─── */}
      {tab === 'limited-time-offers' && (
        <DataTable id="offers-table" columns={[
          { header: 'Book', render: r => <strong>{r.book_title || r.book_id}</strong> },
          { header: 'Book ID / ISBN', render: r => <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-xs)' }}>{r.book_id}</span> },
          { header: 'Discounted Price', render: r => <span style={{ color: 'var(--status-success)', fontWeight: 700 }}>₹{r.discounted_price ?? r.dealPrice ?? r.deal_price ?? '—'}</span> },
          { header: 'Starts', render: r => new Date(r.start_time || r.startsAt || r.starts_at).toLocaleString() },
          { header: 'Ends', render: r => new Date(r.end_time || r.endsAt || r.ends_at).toLocaleString() },
          { header: 'Countdown', render: r => <CountdownTimer endTime={r.end_time || r.endsAt || r.ends_at} /> },
        ]} data={offers} loading={loading}
          headerActions={<button className="btn btn-primary btn-sm" onClick={openCreateOffer}>+ New Offer</button>}
          actions={row => (
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete('offer', row.id)}>Delete</button>
          )}
        />
      )}

      {/* ─── Featured Authors Tab ─── */}
      {tab === 'featured-authors' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <button className="btn btn-primary btn-sm" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Backend API not available">+ Add Featured Author</button>
          </div>
          {loading ? (
            <div className="loading-page"><div className="loading-spinner" /></div>
          ) : (
            <>
              <div style={{
                padding: 'var(--space-4)',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '10px',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text-secondary)',
              }}>
                ℹ️ <strong>Backend not available:</strong> The Featured Authors feature is not implemented in the backend API.
                This section will work once <code>GET/POST/DELETE /admin/featured-authors</code> endpoints are added to the backend.
              </div>
              <div className="empty-state">
                <div className="empty-state-icon">✨</div>
                <div className="empty-state-text">Featured Authors — Coming Soon</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: 'var(--space-2)' }}>
                  This feature requires backend support. Contact the backend team to implement the featured authors API.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Create/Edit Blog/Offer Modal ─── */}
      <Modal isOpen={!!modal} onClose={() => setModal(null)}
        title={`${modal?.mode === 'create' ? 'Create' : 'Edit'} ${modal?.type === 'blog' ? 'Blog' : 'Limited Time Offer'}`}
        maxWidth="600px"
        footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>Save</button></>}>

        {modal?.type === 'blog' && (<>
          <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={form.title || ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Category</label><input className="form-input" value={form.category || ''} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Content</label><textarea className="form-textarea" value={form.content || ''} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} style={{ minHeight: '120px' }} /></div>
          <div className="form-group"><label className="form-label"><input type="checkbox" checked={form.is_published || false} onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))} style={{ marginRight: '8px' }} />Published</label></div>
        </>)}

        {modal?.type === 'offer' && (<>
          <div className="form-group"><label className="form-label">Book Title</label><input className="form-input" value={form.book_title || ''} onChange={e => setForm(p => ({ ...p, book_title: e.target.value }))} placeholder="e.g. The Martian" /></div>
          <div className="form-group"><label className="form-label">Book ID / ISBN</label><input className="form-input" value={form.book_id || ''} onChange={e => setForm(p => ({ ...p, book_id: e.target.value }))} placeholder="UUID or ISBN" /></div>
          <div className="form-group"><label className="form-label">Discounted Price (₹)</label><input className="form-input" type="number" value={form.discounted_price || 0} onChange={e => setForm(p => ({ ...p, discounted_price: Number(e.target.value) }))} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-group"><label className="form-label">Start Time</label><input className="form-input" type="datetime-local" value={form.start_time?.slice(0, 16) || ''} onChange={e => setForm(p => ({ ...p, start_time: new Date(e.target.value).toISOString() }))} /></div>
            <div className="form-group"><label className="form-label">End Time (for countdown timer)</label><input className="form-input" type="datetime-local" value={form.end_time?.slice(0, 16) || ''} onChange={e => setForm(p => ({ ...p, end_time: new Date(e.target.value).toISOString() }))} /></div>
          </div>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>These books will automatically appear on the homepage with a live countdown timer.</div>
        </>)}

      </Modal>

      {/* ─── Add Featured Author Modal ─── */}
      <Modal
        isOpen={addAuthorModal}
        onClose={() => setAddAuthorModal(false)}
        title="Add Featured Author"
        maxWidth="500px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAddAuthorModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddFeaturedAuthor} disabled={!authorForm.name.trim()}>Add Author</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Author Name *</label>
          <input className="form-input" value={authorForm.name} onChange={e => setAuthorForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Haruki Murakami" />
        </div>
        <div className="form-group">
          <label className="form-label">Bio (optional)</label>
          <textarea className="form-textarea" value={authorForm.bio} onChange={e => setAuthorForm(p => ({ ...p, bio: e.target.value }))} placeholder="Short bio..." style={{ minHeight: '60px' }} />
        </div>
        <div className="form-group">
          <label className="form-label">Image URL (optional)</label>
          <input className="form-input" value={authorForm.image_url} onChange={e => setAuthorForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..." />
        </div>
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', padding: 'var(--space-3)', background: 'var(--bg-glass)', borderRadius: '8px', marginTop: 'var(--space-2)' }}>
          This author and their books will be automatically displayed on the homepage&apos;s &ldquo;Featured Authors&rdquo; section.
        </div>
      </Modal>
    </div>
  );
}
