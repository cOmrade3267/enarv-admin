'use client';

export default function StatusBadge({ status }) {
  const statusMap = {
    active: 'success',
    suspended: 'warning',
    banned: 'error',
    deleted: 'error',
    // Order statuses
    pending: 'warning',
    confirmed: 'info',
    shipped: 'info',
    out_for_delivery: 'info',
    delivered: 'success',
    cancelled: 'error',
    returned: 'error',
    paid: 'success',
    failed: 'error',
    // Report statuses
    new: 'warning',
    'in-review': 'info',
    resolved: 'success',
    // Ticket statuses
    open: 'warning',
    in_progress: 'info',
    closed: 'success',
    // Content
    published: 'success',
    draft: 'neutral',
    // Club
    public: 'success',
    private: 'info',
  };

  const variant = statusMap[status?.toLowerCase()] || 'neutral';
  const displayText = status?.replace(/_/g, ' ') || 'unknown';

  return (
    <span className={`badge badge-${variant}`} id={`badge-${status}`}>
      {displayText}
    </span>
  );
}
