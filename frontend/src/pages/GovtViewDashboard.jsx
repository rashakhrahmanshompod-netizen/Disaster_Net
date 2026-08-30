import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Radio, ShieldAlert, Bell, BarChart2, MapPin, Eye } from 'lucide-react';

export const GovtViewDashboard = () => {
  const { token, API_BASE } = useAuth();
  const [disasters, setDisasters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('disasters');

  useEffect(() => {
    fetchAll();
  }, [token]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [dRes, aRes, iRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/disasters/`),
        fetch(`${API_BASE}/disasters/alerts`),
        fetch(`${API_BASE}/inventory/items`),
        fetch(`${API_BASE}/inventory/requests`),
      ]);
      setDisasters(await dRes.json());
      setAlerts(await aRes.json());
      setItems(await iRes.json());
      setRequests(await rRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const active = disasters.filter(d => d.status === 'Active').length;
  const pending = requests.filter(r => r.status === 'Pending').length;
  const inTransit = requests.filter(r => r.status === 'In-Transit').length;
  const lowStock = items.filter(i => i.is_low_stock).length;

  return (
    <div style={{ padding: '28px' }}>
      {/* Govt Analytics Banner */}
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge badge-govt" style={{ marginBottom: '8px' }}>
              <Eye size={14} /> Government Monitoring & Audit Panel
            </span>
            <h1 style={{ color: 'white', fontSize: '1.8rem' }}>National Disaster Activity Monitor</h1>
            <p style={{ color: '#9ca3af', marginTop: '4px', fontSize: '0.9rem' }}>
              Real-time oversight of all disaster events, resource logistics, and system-wide emergency coordination activity.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['disasters', 'alerts', 'inventory', 'requests'].map(v => (
              <button
                key={v}
                className={`btn ${activeView === v ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveView(v)}
                style={{ fontSize: '0.8rem', padding: '7px 14px', textTransform: 'capitalize' }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Active Disasters', value: active, color: '#ef4444' },
          { label: 'Emergency Alerts', value: alerts.length, color: '#f59e0b' },
          { label: 'Pending Requests', value: pending, color: '#8b5cf6' },
          { label: 'Convoys In-Transit', value: inTransit, color: '#10b981' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card" style={{ borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color, marginTop: '4px' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Dynamic View Tables */}
      <div className="glass-card">
        {loading ? (
          <div style={{ padding: '24px', color: '#9ca3af', textAlign: 'center' }}>Loading national data...</div>
        ) : activeView === 'disasters' ? (
          <>
            <h2 style={{ color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert color="#ef4444" /> All Declared Disaster Events
            </h2>
            <div className="data-table-container">
              <table className="data-table">
                <thead><tr><th>Title</th><th>Type</th><th>Severity</th><th>Districts</th><th>Duration</th><th>Status</th><th>Declared By</th></tr></thead>
                <tbody>
                  {disasters.map(d => (
                    <tr key={d.id}>
                      <td><strong style={{ color: 'white' }}>{d.title}</strong></td>
                      <td>{d.disaster_type}</td>
                      <td><span className={`badge ${d.severity === 'Critical' ? 'badge-critical' : 'badge-warning'}`}>{d.severity}</span></td>
                      <td style={{ fontSize: '0.85rem' }}>{d.affected_districts}</td>
                      <td>{d.expected_duration}</td>
                      <td><span className={`badge ${d.status === 'Active' ? 'badge-critical' : d.status === 'Contained' ? 'badge-warning' : 'badge-org'}`}>{d.status}</span></td>
                      <td style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{d.declared_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : activeView === 'alerts' ? (
          <>
            <h2 style={{ color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell color="#f59e0b" /> Emergency Alerts & Evacuation Notices
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {alerts.map(al => (
                <div key={al.id} style={{ background: 'rgba(31,41,55,0.6)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span className="badge badge-critical">{al.alert_level}</span>
                    <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{new Date(al.created_at).toLocaleString()}</span>
                  </div>
                  <h4 style={{ color: 'white' }}>{al.title}</h4>
                  <p style={{ color: '#d1d5db', fontSize: '0.85rem', marginTop: '4px' }}>{al.message}</p>
                  <div style={{ fontSize: '0.8rem', color: '#60a5fa', marginTop: '6px' }}>Area: {al.affected_area} | By: {al.published_by}</div>
                </div>
              ))}
            </div>
          </>
        ) : activeView === 'inventory' ? (
          <>
            <h2 style={{ color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart2 color="#10b981" /> Nationwide Warehouse Inventory Status
              {lowStock > 0 && <span className="badge badge-critical">{lowStock} Low Stock</span>}
            </h2>
            <div className="data-table-container">
              <table className="data-table">
                <thead><tr><th>Item</th><th>Category</th><th>Organization</th><th>Quantity</th><th>Min Threshold</th><th>Warehouse</th><th>Stock Status</th></tr></thead>
                <tbody>
                  {items.map(i => (
                    <tr key={i.id}>
                      <td><strong style={{ color: 'white' }}>{i.item_name}</strong></td>
                      <td><span className="badge badge-org">{i.category}</span></td>
                      <td style={{ fontSize: '0.85rem' }}>{i.organization_name}</td>
                      <td style={{ fontWeight: 700, color: i.is_low_stock ? '#ef4444' : '#34d399' }}>{i.quantity} {i.unit}</td>
                      <td>{i.minimum_threshold}</td>
                      <td style={{ fontSize: '0.85rem' }}>{i.warehouse_location}</td>
                      <td><span className={`badge ${i.is_low_stock ? 'badge-critical' : 'badge-org'}`}>{i.is_low_stock ? 'Low Stock' : 'Adequate'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin color="#8b5cf6" /> All Emergency Resource Requests & Deliveries
            </h2>
            <div className="data-table-container">
              <table className="data-table">
                <thead><tr><th>Item Requested</th><th>Qty</th><th>Priority</th><th>Requester</th><th>Destination</th><th>Status</th><th>ETA</th></tr></thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id}>
                      <td><strong style={{ color: 'white' }}>{r.item_name}</strong><div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{r.item_category}</div></td>
                      <td>{r.quantity} {r.unit}</td>
                      <td><span className={`badge ${r.priority === 'Critical' ? 'badge-critical' : 'badge-warning'}`}>{r.priority}</span></td>
                      <td style={{ fontSize: '0.85rem' }}>{r.requester_name}</td>
                      <td style={{ fontSize: '0.82rem' }}>{r.destination_address}</td>
                      <td><span className={`badge ${r.status === 'In-Transit' ? 'badge-warning' : r.status === 'Delivered' ? 'badge-org' : 'badge-user'}`}>{r.status}</span></td>
                      <td style={{ fontSize: '0.85rem', color: '#fbbf24' }}>{r.estimated_arrival_minutes ? `${r.estimated_arrival_minutes} min` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
