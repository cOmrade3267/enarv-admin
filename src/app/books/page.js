'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { adminApi, formatAdminApiError, buildBookWritePayloadFromForm, sanitizeBookPatchBody } from '@/lib/api';

const emptyBook = {
  isbn: '', title: '', cover_image: '', author: '', description: '',
  genre: '', mrp: '', price: '', stock: 0, tags: '', language: 'English', pages: 0,
};

/** GET responses: price_mrp & price_discount are paise. Writes use MRP in ₹ and discount in paise — see api.js. */
function rupeesFromApiBook(b) {
  const mrpPaise = Number(b.price_mrp);
  const discPaise = Number(b.price_discount ?? 0);
  if (!Number.isFinite(mrpPaise) || mrpPaise < 0) {
    return { mrp: 0, price: 0 };
  }
  const mrp = Math.round(mrpPaise) / 100;
  const discount = Math.max(0, Math.round(discPaise));
  const sellPaise = Math.max(0, Math.round(mrpPaise) - discount);
  const price = sellPaise / 100;
  return { mrp, price };
}

function parseRupeesInput(v) {
  if (v === '' || v == null) return 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export default function BooksPage() {
  const showToast = useToast();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', book }
  const [form, setForm] = useState({ ...emptyBook });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [stockQty, setStockQty] = useState(0);
  const [bulkModal, setBulkModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getBooks();
      const list = Array.isArray(res) ? res : [];

      const normalized = list.map(b => {
        const { mrp, price } =
          b.price_mrp != null && b.price_mrp !== ''
            ? rupeesFromApiBook(b)
            : {
                mrp: parseRupeesInput(b.mrp),
                price: parseRupeesInput(b.price ?? b.selling_price),
              };

        return {
          ...b,
          id: b.id || b.book_id || b._id,
          isbn: b.isbn || '',
          author: b.authors?.[0]?.name || b.author || b.author_name || '—',
          price,
          mrp,
          stock: b.stock ?? b.stock_quantity ?? b.quantity ?? 0,
          pages: b.pages || b.total_pages || 0,
          tags: b.tags || b.meta_tags || '',
          cover_image: b.cover_image || b.cover_url || b.image_base64 || b.image_url || '',
          language: b.language || 'English',
          genre: b.genre || '',
          description: b.description || '',
        };
      });

      setBooks(normalized);
    } catch (err) {
      showToast(formatAdminApiError(err) || 'Failed to load books from backend', 'error');
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  // --- Duplicate ISBN check ---
  function checkDuplicateISBN(isbn, excludeId = null) {
    if (!isbn || !isbn.trim()) return null;
    const dup = books.find(b =>
      b.isbn && b.isbn.trim().toLowerCase() === isbn.trim().toLowerCase() &&
      b.id !== excludeId
    );
    return dup || null;
  }

  // --- Add/Edit ---
  function openCreate() {
    setForm({ ...emptyBook });
    setModal({ mode: 'create' });
  }

  function openEdit(book) {
    setForm({
      isbn: book.isbn || '',
      title: book.title || '',
      cover_image: book.cover_image || '',
      author: book.author || '',
      description: book.description || '',
      genre: book.genre || '',
      mrp: book.mrp !== undefined && book.mrp !== null ? String(book.mrp) : '',
      price: book.price !== undefined && book.price !== null ? String(book.price) : '',
      stock: book.stock || 0,
      tags: typeof book.tags === 'string' ? book.tags : (Array.isArray(book.tags) ? book.tags.join(', ') : ''),
      language: book.language || 'English',
      pages: book.pages || 0,
    });
    setModal({ mode: 'edit', book });
  }

  async function handleSave() {
    if (!form.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }

    // Duplicate ISBN check
    const excludeId = modal?.mode === 'edit' ? modal.book.id : null;
    const dup = checkDuplicateISBN(form.isbn, excludeId);
    if (dup) {
      const sameLang = dup.language?.toLowerCase() === (form.language || 'english').toLowerCase();
      if (sameLang) {
        showToast(`Duplicate ISBN: "${dup.title}" already has ISBN ${form.isbn} in the same language. Different languages are allowed.`, 'error');
        return;
      }
    }

    const mrpRs = parseRupeesInput(form.mrp);
    const priceRs = parseRupeesInput(form.price);
    if (mrpRs <= 0) {
      showToast('Enter a valid MRP (₹) greater than 0', 'error');
      return;
    }
    if (priceRs > mrpRs) {
      showToast('Selling price cannot be higher than MRP. Both are in ₹ (rupees).', 'error');
      return;
    }

    setSaving(true);
    try {
      const write = buildBookWritePayloadFromForm(form, mrpRs, priceRs);

      if (modal.mode === 'create') {
        await adminApi.addBook({ ...write, author: form.author });
        showToast('Book added successfully!');
      } else {
        await adminApi.updateBook(modal.book, sanitizeBookPatchBody(write));
        showToast('Book updated successfully!');
      }
      setModal(null);
      loadBooks();
    } catch (err) {
      showToast(formatAdminApiError(err) || 'Failed to save book', 'error');
    } finally {
      setSaving(false);
    }
  }

  // --- Delete ---
  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await adminApi.deleteBook(confirmDelete);
      showToast('Book deleted');
      loadBooks();
    } catch (err) {
      showToast(formatAdminApiError(err) || 'Failed to delete book', 'error');
    }
    setConfirmDelete(null);
  }

  // --- Stock Update ---
  async function handleStockUpdate() {
    if (!stockModal) return;
    try {
      // Backend expects offset (delta), not absolute value
      const currentStock = stockModal.stock || 0;
      const newStock = Number(stockQty);
      const delta = newStock - currentStock;
      await adminApi.updateBookStock(stockModal, delta);
      showToast('Stock updated');
      loadBooks();
    } catch (err) {
      showToast(formatAdminApiError(err) || 'Failed to update stock', 'error');
    }
    setStockModal(null);
  }

  // --- Bulk Upload ---
  async function handleBulkUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      showToast('Please select a CSV file', 'error');
      return;
    }
    setUploading(true);
    try {
      await adminApi.bulkUploadBooks(file);
      showToast('Bulk upload successful!');
      setBulkModal(false);
      loadBooks();
    } catch (err) {
      showToast(formatAdminApiError(err) || 'Bulk upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  function updateField(key, value) {
    setForm((p) => {
      const next = { ...p, [key]: value };
      if (key === 'mrp' || key === 'price') {
        const m = parseRupeesInput(key === 'mrp' ? value : next.mrp);
        const pr = parseRupeesInput(key === 'price' ? value : next.price);
        if (pr > m && m >= 0) {
          next.price = String(m);
        }
      }
      return next;
    });
  }

  const mrpNum = parseRupeesInput(form.mrp);
  const priceNum = parseRupeesInput(form.price);
  const discountRupees = Math.max(0, mrpNum - priceNum);
  const pctOff = mrpNum > 0 ? Math.round((discountRupees / mrpNum) * 100) : 0;

  return (
    <div id="books-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Books Inventory</h1>
          <p className="page-subtitle">Manage the book catalog</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={() => setBulkModal(true)} id="bulk-upload-btn">
            📄 Bulk Upload CSV
          </button>
          <button className="btn btn-primary" onClick={openCreate} id="add-book-btn">
            + Add Book
          </button>
        </div>
      </div>

      <DataTable
        id="books-table"
        columns={[
          { header: 'ISBN', accessor: (r) => r.isbn || r.id || '', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-xs)' }}>{r.isbn || r.id?.substring(0, 8)}</span> },
          { header: 'Cover', accessor: 'title', render: (r) => r.cover_image ? <Image src={r.cover_image} alt={r.title} width={36} height={48} unoptimized style={{ width: 36, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : <span style={{ color: 'var(--text-muted)' }}>📕</span> },
          { header: 'Title', accessor: 'title', render: (r) => <strong>{r.title}</strong> },
          { header: 'Author', accessor: 'author', render: (r) => r.author || '—' },
          { header: 'Genre', accessor: 'genre', render: (r) => r.genre ? <span className="chip">{r.genre}</span> : '—' },
          { header: 'Price', accessor: (r) => String(r.price ?? ''), render: (r) => `₹${Number(r.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
          { header: 'MRP', accessor: (r) => String(r.mrp ?? ''), render: (r) => <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>₹{Number(r.mrp).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span> },
          { header: 'Stock', accessor: (r) => String(r.stock ?? ''), render: (r) => (
            <span style={{ color: r.stock === 0 ? 'var(--status-danger)' : r.stock < 10 ? 'var(--status-warning)' : 'var(--text-primary)', fontWeight: 600 }}>
              {r.stock}
            </span>
          )},
          { header: 'Language', accessor: 'language', render: (r) => r.language || '—' },
          { header: 'Pages', accessor: (r) => String(r.pages ?? ''), render: (r) => r.pages || '—' },
          { header: 'Tags', accessor: (r) => (typeof r.tags === 'string' ? r.tags : Array.isArray(r.tags) ? r.tags.join(' ') : ''), render: (r) => {
            const tags = typeof r.tags === 'string' ? r.tags.split(',').filter(Boolean) : (Array.isArray(r.tags) ? r.tags : []);
            return tags.slice(0, 2).map((t, i) => <span key={i} className="chip" style={{ marginRight: 4, fontSize: 'var(--font-xs)' }}>{t.trim()}</span>);
          }},
        ]}
        data={books}
        loading={loading}
        emptyMessage="No books found"
        emptyIcon="📚"
        actions={(row) => (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setStockModal(row); setStockQty(row.stock); }}>Stock</button>
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(row)}>Delete</button>
          </div>
        )}
      />

      {/* Add/Edit Book Modal */}
      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? 'Add New Book' : `Edit: ${modal?.book?.title || ''}`}
        maxWidth="680px"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : modal?.mode === 'create' ? 'Add Book' : 'Update Book'}
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">ISBN</label>
            <input className="form-input" value={form.isbn} onChange={e => updateField('isbn', e.target.value)} placeholder="e.g. 978-0-06-112008-4" />
            {form.isbn && checkDuplicateISBN(form.isbn, modal?.book?.id) && (
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--status-warning)', marginTop: '4px' }}>
                ⚠️ ISBN already exists: &ldquo;{checkDuplicateISBN(form.isbn, modal?.book?.id)?.title}&rdquo;
                {checkDuplicateISBN(form.isbn, modal?.book?.id)?.language?.toLowerCase() !== (form.language || 'english').toLowerCase()
                  ? ' (different language — allowed)'
                  : ' (same language — will be blocked)'}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Language</label>
            <input className="form-input" value={form.language} onChange={e => updateField('language', e.target.value)} placeholder="e.g. English" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Title *</label>
          <input className="form-input" value={form.title} onChange={e => updateField('title', e.target.value)} placeholder="Book title" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">Author</label>
            <input className="form-input" value={form.author} onChange={e => updateField('author', e.target.value)} placeholder="Author name" />
          </div>
          <div className="form-group">
            <label className="form-label">Genre</label>
            <input className="form-input" value={form.genre} onChange={e => updateField('genre', e.target.value)} placeholder="e.g. Fiction, Fantasy" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Book description..." style={{ minHeight: '80px' }} />
        </div>

        <div className="form-group">
          <label className="form-label">Cover Image URL</label>
          <input className="form-input" value={form.cover_image} onChange={e => updateField('cover_image', e.target.value)} placeholder="https://..." />
        </div>

        <div
          style={{
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
            background: 'var(--bg-glass)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          <strong style={{ color: 'var(--text-primary)' }}>Pricing (Indian rupees ₹)</strong>
          <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
            Enter <strong>MRP</strong> and <strong>selling price</strong> in rupees (e.g. <code>499</code> / <code>399</code>). The table below shows ₹ after loading from the server.
            Selling price is what the customer pays; it must be ≤ MRP.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">MRP — max retail price (₹)</label>
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="e.g. 499"
              value={form.mrp}
              onChange={(e) => updateField('mrp', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Selling price (₹)</label>
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="Same as MRP if no discount"
              value={form.price}
              onChange={(e) => updateField('price', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Stock quantity</label>
            <input className="form-input" type="number" value={form.stock} onChange={e => updateField('stock', Number(e.target.value))} min="0" />
          </div>
        </div>

        {modal && (form.mrp !== '' || form.price !== '') && (
          <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
            Discount: <strong style={{ color: 'var(--text-primary)' }}>₹{discountRupees.toFixed(2)}</strong>
            {mrpNum > 0 && priceNum <= mrpNum ? (
              <> ({pctOff}% off list)</>
            ) : null}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">Total Pages</label>
            <input className="form-input" type="number" value={form.pages} onChange={e => updateField('pages', Number(e.target.value))} min="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Tags (comma-separated)</label>
            <input className="form-input" value={form.tags} onChange={e => updateField('tags', e.target.value)} placeholder="fiction, bestseller, award-winner" />
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Book"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete Book</button>
          </>
        }
      >
        <div className="confirm-dialog-text">
          <div className="confirm-dialog-icon danger">🗑️</div>
          <h3>Delete this book?</h3>
          <p>Are you sure you want to delete <strong>{confirmDelete?.title}</strong>? This action cannot be undone.</p>
        </div>
      </Modal>

      {/* Update Stock Modal */}
      <Modal
        isOpen={!!stockModal}
        onClose={() => setStockModal(null)}
        title={`Update Stock: ${stockModal?.title || ''}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setStockModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleStockUpdate}>Update Stock</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Current Stock: <strong>{stockModal?.stock}</strong></label>
          <input
            className="form-input"
            type="number"
            value={stockQty}
            onChange={e => setStockQty(Number(e.target.value))}
            min="0"
            style={{ fontSize: 'var(--font-lg)', fontWeight: 700, textAlign: 'center' }}
          />
        </div>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal
        isOpen={bulkModal}
        onClose={() => setBulkModal(false)}
        title="Bulk Upload Books"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setBulkModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleBulkUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : '📤 Upload'}
            </button>
          </>
        }
      >
        <div style={{ padding: 'var(--space-4)' }}>
          <p style={{ marginBottom: 'var(--space-3)', color: 'var(--text-secondary)', fontSize: 'var(--font-sm)', lineHeight: 1.55 }}>
            Upload a <strong>.csv</strong> file (first row = column headers). Use <strong>UTF-8</strong> encoding. Prices are in <strong>₹ rupees</strong> (same as the form).
          </p>

          <div
            style={{
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-3)',
              background: 'var(--bg-glass)',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 'var(--font-xs)',
              overflowX: 'auto',
            }}
          >
            <div style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>Required header row (order can vary):</div>
            <code>
              isbn,title,author,genre,mrp,price,stock_quantity,language,total_pages,tags,description
            </code>
            <div style={{ color: 'var(--text-muted)', margin: '12px 0 6px' }}>Example data row:</div>
            <code>
              9780000000001,Sample Book,Author Name,Fiction,499,399,50,English,320,&quot;fiction,bestseller&quot;,Optional description
            </code>
          </div>

          <ul style={{ margin: '0 0 var(--space-4)', paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: 'var(--font-sm)', lineHeight: 1.6 }}>
            <li><strong>mrp</strong>, <strong>price</strong> — rupees (e.g. <code>399</code> = ₹399). <strong>price</strong> ≤ <strong>mrp</strong>.</li>
            <li><strong>stock_quantity</strong> — integer count.</li>
            <li><strong>total_pages</strong> — page count (optional).</li>
            <li><strong>tags</strong> — comma-separated inside the cell if needed; quote the field if it contains commas.</li>
            <li>Empty <strong>title</strong> rows are skipped. <strong>title</strong> is required for each imported book.</li>
          </ul>

          <input
            type="file"
            accept=".csv,text/csv"
            ref={fileRef}
            className="form-input"
            style={{ padding: 'var(--space-3)' }}
          />
          <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--bg-glass)', borderRadius: '8px', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            <strong>Note:</strong> Duplicate ISBNs in the same language are skipped on the server. Excel <strong>.xlsx</strong> is not parsed — export as CSV first.
          </div>
        </div>
      </Modal>
    </div>
  );
}
