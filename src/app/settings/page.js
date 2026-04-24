'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { adminApi, formatAdminApiError } from '@/lib/api';

const defaultSettings = {
  minDiscountOrderValue: 500,
  maxDiscountPercent: 30,
  storyDurationHours: 24,
  chatRetentionDays: 90,
  referralRewardAmount: 50,
  referralMilestones: '3,7,15,30',
  maintenanceMode: false,
};

const fields = [
  { key: 'minDiscountOrderValue', label: 'Min Order Value for Discount (₹)', type: 'number', desc: 'Minimum order amount required to apply discounts' },
  { key: 'maxDiscountPercent', label: 'Max Discount Percentage (%)', type: 'number', desc: 'Maximum discount that can be applied on any order' },
  { key: 'storyDurationHours', label: 'Story Duration (hours)', type: 'number', desc: 'How long stories remain visible before expiring' },
  { key: 'chatRetentionDays', label: 'Chat History Retention (days)', type: 'number', desc: 'Number of days to retain chat messages' },
  { key: 'referralRewardAmount', label: 'Referral Reward (₹)', type: 'number', desc: 'Wallet credit given per successful referral' },
  { key: 'referralMilestones', label: 'Referral Milestones', type: 'text', desc: 'Comma-separated milestone values (e.g., 3,7,15,30)' },
  { key: 'maintenanceMode', label: 'Maintenance Mode', type: 'checkbox', desc: 'Enable to put the platform in maintenance mode' },
];

const keyMap = {
  minDiscountOrderValue: 'min_discount_order_value',
  maxDiscountPercent: 'max_discount_percent',
  storyDurationHours: 'story_duration_hours',
  chatRetentionDays: 'chat_retention_days',
  referralRewardAmount: 'referral_reward_amount',
  referralMilestones: 'referral_milestones',
  maintenanceMode: 'maintenance_mode',
};

export default function SettingsPage() {
  const showToast = useToast();
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadBanner, setLoadBanner] = useState(null);

  useEffect(() => {
    adminApi
      .getSettings()
      .then((r) => {
        const merged = { ...defaultSettings };
        Object.entries(r || {}).forEach(([serverKey, rawVal]) => {
          const key = Object.keys(keyMap).find((k) => keyMap[k] === serverKey) || serverKey;
          if (merged[key] !== undefined) {
            if (typeof merged[key] === 'number') merged[key] = Number(rawVal) || 0;
            else if (typeof merged[key] === 'boolean') merged[key] = rawVal === true || rawVal === 'true';
            else merged[key] = typeof rawVal === 'string' ? rawVal.replace(/^"|"$/g, '') : rawVal;
          }
        });
        setSettings(merged);
        setLoadBanner(null);
      })
      .catch((err) => {
        showToast(formatAdminApiError(err) || 'Failed to load settings', 'error');
        setSettings(defaultSettings);
        setLoadBanner(
          'Could not load settings from the API. Showing defaults below; save may still fail if the server is misconfigured.'
        );
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    let errorOccurred = false;
    try {
      const entries = Object.entries(settings);
      for (const [key, value] of entries) {
        try {
          if (key === 'maintenanceMode') {
            await adminApi.toggleKillSwitch(value);
          } else {
            await adminApi.updateSettings({ key: keyMap[key] || key, value });
          }
        } catch (err) {
          console.error(`Failed to save setting ${key}:`, err);
          errorOccurred = true;
        }
      }
      if (errorOccurred) {
        showToast('Some settings failed to save. Check console for details.', 'warning');
      } else {
        showToast('Settings saved!');
      }
    } catch (err) {
      showToast(formatAdminApiError(err) || 'Failed to save settings', 'error');
    }
    setSaving(false);
  }

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;

  return (
    <div id="settings-page">
      {loadBanner ? (
        <div
          className="card"
          style={{
            maxWidth: '700px',
            marginBottom: 'var(--space-4)',
            borderLeft: '3px solid var(--accent-warning, #d4a017)',
            background: 'var(--bg-glass)',
          }}
        >
          <p style={{ margin: 0, fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>{loadBanner}</p>
        </div>
      ) : null}
      <div className="card" style={{ maxWidth: '700px' }}>
        <form onSubmit={handleSave}>
          {fields.map(f => (
            <div className="form-group" key={f.key} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-4)' }}>
              {f.type === 'checkbox' ? (
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings[f.key] || false} onChange={e => setSettings(p => ({ ...p, [f.key]: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)' }} />
                  <div><strong>{f.label}</strong><div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>{f.desc}</div></div>
                </label>
              ) : (
                <>
                  <label className="form-label">{f.label}</label>
                  <input className="form-input" type={f.type} value={settings[f.key] ?? ''} onChange={e => setSettings(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))} />
                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>{f.desc}</div>
                </>
              )}
            </div>
          ))}
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving} style={{ width: '100%', marginTop: 'var(--space-4)' }}>
            {saving ? 'Saving...' : '💾 Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
}
