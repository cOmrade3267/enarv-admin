'use client';

import { useState, useEffect } from 'react';

export default function DataTable({
  columns,
  data = [],
  title,
  actions,
  searchable = true,
  pagination = true,
  pageSize = 15,
  onSearch,
  totalCount,
  currentPage: externalPage,
  onPageChange,
  loading = false,
  emptyMessage = 'No data found',
  emptyIcon = '📭',
  headerActions,
  id = 'data-table',
}) {
  const [search, setSearch] = useState('');
  const [internalPage, setInternalPage] = useState(1);

  // Use external page control if provided, otherwise use internal state
  const isExternalPagination = typeof onPageChange === 'function';
  const currentPage = isExternalPagination ? (externalPage || 1) : internalPage;
  const setPage = isExternalPagination ? onPageChange : setInternalPage;

  // Reset internal page when search changes or data changes significantly
  useEffect(() => {
    if (!isExternalPagination) {
      setInternalPage(1);
    }
  }, [search, isExternalPagination]);

  const q = (search || '').trim().toLowerCase();
  const filteredData = onSearch
    ? data
    : q === ''
      ? data
      : data.filter((row) =>
          columns.some((col) => {
            const val = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
            return String(val || '').toLowerCase().includes(q);
          })
        );

  const total = totalCount || filteredData.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIdx = (currentPage - 1) * pageSize;
  const pageData = isExternalPagination ? filteredData : filteredData.slice(startIdx, startIdx + pageSize);

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearch(val);
    if (onSearch) onSearch(val);
  };

  return (
    <div className="data-table-wrapper" id={id}>
      <div className="data-table-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          {title && <h2 className="data-table-title">{title}</h2>}
          {searchable && (
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search..."
                value={search}
                onChange={handleSearch}
                id={`${id}-search`}
              />
            </div>
          )}
        </div>
        {headerActions && <div className="data-table-actions">{headerActions}</div>}
      </div>

      {loading ? (
        <div className="loading-page">
          <div className="loading-spinner" />
        </div>
      ) : pageData.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{emptyIcon}</div>
          <div className="empty-state-text">{emptyMessage}</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key || col.accessor} style={col.style}>
                    {col.header}
                  </th>
                ))}
                {actions && <th style={{ width: 120 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageData.map((row, i) => (
                <tr key={row.id || i}>
                  {columns.map((col) => (
                    <td key={col.key || col.accessor} style={col.cellStyle}>
                      {col.render
                        ? col.render(row)
                        : typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : row[col.accessor]}
                    </td>
                  ))}
                  {actions && <td>{actions(row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && totalPages > 1 && (
        <div className="data-table-pagination">
          <span className="data-table-pagination-info">
            Showing {startIdx + 1}–{Math.min(startIdx + pageSize, total)} of {total}
          </span>
          <div className="data-table-pagination-controls">
            <button
              className="btn btn-ghost btn-sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              id={`${id}-prev`}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              id={`${id}-next`}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
