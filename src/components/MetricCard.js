'use client';

export default function MetricCard({ label, value, icon, color, trend, trendValue }) {
  return (
    <div className="metric-card" style={{ '--metric-color': color }}>
      <div className="metric-card-icon" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="metric-card-value">{value ?? '—'}</div>
      <div className="metric-card-label">{label}</div>
      {trend && (
        <div className={`metric-card-trend ${trend}`}>
          {trend === 'up' ? '↑' : '↓'} {trendValue}
        </div>
      )}
    </div>
  );
}
