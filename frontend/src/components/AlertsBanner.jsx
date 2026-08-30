import React from 'react';
import { AlertTriangle, Info, ShieldAlert, Radio } from 'lucide-react';

export const AlertsBanner = ({ alerts }) => {
  if (!alerts || alerts.length === 0) return null;

  const topAlert = alerts[0];

  const getAlertStyle = (level) => {
    switch (level) {
      case 'Evacuation':
      case 'Severe':
        return {
          bg: 'linear-gradient(90deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.25))',
          border: '1px solid rgba(239, 68, 68, 0.5)',
          color: '#fca5a5',
          icon: <ShieldAlert color="#ef4444" size={20} />
        };
      case 'Warning':
      default:
        return {
          bg: 'linear-gradient(90deg, rgba(245, 158, 11, 0.25), rgba(180, 83, 9, 0.25))',
          border: '1px solid rgba(245, 158, 11, 0.5)',
          color: '#fde68a',
          icon: <AlertTriangle color="#f59e0b" size={20} />
        };
    }
  };

  const style = getAlertStyle(topAlert.alert_level);

  return (
    <div style={{
      background: style.bg,
      border: style.border,
      borderRadius: '14px',
      padding: '16px 20px',
      margin: '20px 28px 0 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      animation: 'pulse 3s infinite'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div>{style.icon}</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`badge ${topAlert.alert_level === 'Evacuation' ? 'badge-critical' : 'badge-warning'}`}>
              {topAlert.alert_level}
            </span>
            <span style={{ fontWeight: 700, color: 'white', fontSize: '0.95rem' }}>
              {topAlert.title}
            </span>
          </div>
          <p style={{ color: style.color, fontSize: '0.85rem', marginTop: '4px' }}>
            {topAlert.message} <strong style={{ color: 'white' }}>[{topAlert.affected_area}]</strong>
          </p>
        </div>
      </div>
      <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Radio size={14} /> Official Broadcast
      </div>
    </div>
  );
};
