'use client';

import { useState, useEffect, useRef } from 'react';
import { adminApi } from '@/lib/api';

// Dynamic import for Chart.js to avoid SSR issues
let Chart, registerables;

function AnalyticsChart({ title, data, color, type = 'line', id }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!data || !canvasRef.current) return;

    async function initChart() {
      if (!Chart) {
        const chartjs = await import('chart.js');
        Chart = chartjs.Chart;
        registerables = chartjs.registerables;
        Chart.register(...registerables);
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
        Chart.defaults.font.family = 'Inter, sans-serif';
      }

      if (chartRef.current) chartRef.current.destroy();

      const labels = data.map(d => {
        const dt = new Date(d.date);
        return `${dt.getDate()}/${dt.getMonth() + 1}`;
      });
      const values = data.map(d => d.count);

      const gradient = canvasRef.current.getContext('2d').createLinearGradient(0, 0, 0, 280);
      gradient.addColorStop(0, color + '40');
      gradient.addColorStop(1, color + '00');

      chartRef.current = new Chart(canvasRef.current, {
        type,
        data: {
          labels,
          datasets: [{
            label: title,
            data: values,
            borderColor: color,
            backgroundColor: type === 'line' ? gradient : color + '80',
            fill: type === 'line',
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: color,
            barPercentage: 0.6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1e293b',
              titleColor: '#f1f5f9',
              bodyColor: '#94a3b8',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              cornerRadius: 8,
              padding: 12,
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 10, font: { size: 11 } },
            },
            y: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: { font: { size: 11 } },
            },
          },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    initChart();
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, color, type, title]);

  return (
    <div className="card" id={id}>
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        <span className="chip">{data?.length || 0} days</span>
      </div>
      <div className="chart-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState({
    userGrowth: [],
    dailyActiveUsers: [],
    postsPerDay: [],
    commentsPerDay: [],
    ordersPerDay: [],
    referralGrowth: [],
    _meta: null,
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await adminApi.getAnalytics();
        const { _meta, ...charts } = res || {};
        setData({ ...charts, _meta: _meta || null });
      } catch {
        setData({
          userGrowth: [],
          dailyActiveUsers: [],
          postsPerDay: [],
          commentsPerDay: [],
          ordersPerDay: [],
          referralGrowth: [],
          _meta: null,
        });
      }
    }
    load();
  }, []);

  return (
    <div id="analytics-page">


      <div className="content-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <AnalyticsChart
          title="Total users (cumulative)"
          data={data.userGrowth}
          color="#6366f1"
          id="chart-user-growth"
        />
        <AnalyticsChart
          title="New signups / day"
          data={data.dailyActiveUsers}
          color="#8b5cf6"
          type="bar"
          id="chart-dau"
        />
        <AnalyticsChart title="Posts per day (feed sample)" data={data.postsPerDay} color="#06b6d4" id="chart-posts" />
        <AnalyticsChart
          title="Comments per day (post sample)"
          data={data.commentsPerDay}
          color="#10b981"
          type="bar"
          id="chart-comments"
        />
        <AnalyticsChart title="Orders per day" data={data.ordersPerDay} color="#f59e0b" type="bar" id="chart-orders" />
        <AnalyticsChart
          title="Referred users / day (your account)"
          data={data.referralGrowth}
          color="#ec4899"
          id="chart-referrals"
        />
      </div>

      {data._meta && (
        <p
          className="page-subtitle"
          style={{ marginTop: 'var(--space-4)', maxWidth: 720, color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}
        >
          Samples: {data._meta.usersSampled} users, {data._meta.ordersSampled} orders, {data._meta.postsSampled} posts,{' '}
          {data._meta.commentsSampled} comments, {data._meta.referralsSampled} referrals. {data._meta.commentsNote}
        </p>
      )}
    </div>
  );
}
