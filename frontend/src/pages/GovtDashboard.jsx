import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Radio, AlertOctagon, PlusCircle, CheckCircle, ShieldAlert, MapPin, Bell } from 'lucide-react';
import { hasGoogleMapsApiKey, loadGoogleMaps } from '../services/googleMaps';

export const GovtDashboard = () => {
  const { token, API_BASE, user } = useAuth();
  const [disasters, setDisasters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  const [newDisaster, setNewDisaster] = useState({
    title: '',
    disaster_type: 'Flood',
    severity: 'High',
    affected_districts: '',
    expected_duration: '7 Days',
    lat: 24.8949,
    lng: 91.8687,
  });

  const [newAlert, setNewAlert] = useState({
    title: '',
    message: '',
    alert_level: 'Evacuation',
    affected_area: '',
  });

  useEffect(() => {
    fetchGovtData();
  }, [token]);

  const refreshSharedViews = () => {
    window.dispatchEvent(new Event('disasternet:shared-data-changed'));
  };

  const fetchGovtData = async () => {
    try {
      setLoading(true);
      const [dRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/disasters/`),
        fetch(`${API_BASE}/disasters/alerts`),
      ]);
      const dData = await dRes.json();
      const aData = await aRes.json();
      setDisasters(dData);
      setAlerts(aData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeclareDisaster = async (e) => {
    e.preventDefault();
    try {
      let disasterPayload = { ...newDisaster };

      // When Google Maps is configured, resolve the first affected district to
      // coordinates before saving. The existing default coordinates remain as
      // a fallback so disaster declaration still works without Google Maps.
      if (hasGoogleMapsApiKey() && newDisaster.affected_districts.trim()) {
        try {
          await loadGoogleMaps();
          const { Geocoder } = await window.google.maps.importLibrary('geocoding');
          const geocoder = new Geocoder();
          const primaryDistrict = newDisaster.affected_districts.split(/,|&| and /i)[0].trim();
          const result = await geocoder.geocode({
            address: `${primaryDistrict}, Bangladesh`,
            componentRestrictions: { country: 'BD' },
          });
          const location = result.results?.[0]?.geometry?.location;
          if (location) {
            disasterPayload = {
              ...disasterPayload,
              lat: location.lat(),
              lng: location.lng(),
            };
          }
        } catch (geocodeError) {
          console.warn('Google geocoding unavailable; using existing disaster coordinates:', geocodeError);
        }
      }

      const res = await fetch(`${API_BASE}/disasters/declare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(disasterPayload),
      });
      if (!res.ok) throw new Error('Failed to declare disaster');
      alert('Official Disaster Event declared successfully.');
      setShowDeclareModal(false);
      await fetchGovtData();
      refreshSharedViews();
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePublishAlert = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/disasters/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newAlert),
      });
      if (!res.ok) throw new Error('Failed to publish alert');
      alert('Emergency Alert & Evacuation Notice broadcasted to all citizens.');
      setShowAlertModal(false);
      await fetchGovtData();
      refreshSharedViews();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateStatus = async (id, statusVal) => {
    try {
      const res = await fetch(`${API_BASE}/disasters/${id}/status?status_val=${statusVal}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to update status');
      await fetchGovtData();
      refreshSharedViews();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="theme-government" style={{ padding: '28px' }}>
      {/* Header Banner */}
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge badge-govt" style={{ marginBottom: '8px' }}>
              <Radio size={14} /> Emergency Response Management
            </span>
            <h1 style={{ color: 'white', fontSize: '1.8rem' }}>Government Disaster Authority Console</h1>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>
              Supervise disaster lifecycles, declare national emergency events, and publish nationwide evacuation notices.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-danger" onClick={() => setShowAlertModal(true)}>
              <Bell size={16} /> Broadcast Emergency Alert
            </button>
            <button className="btn btn-primary" onClick={() => setShowDeclareModal(true)}>
              <PlusCircle size={16} /> Declare Disaster Event
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Active Disasters Table */}
        <div className="glass-card">
          <h2 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert color="#ef4444" /> Declared Disaster Events Lifecycle
          </h2>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event Title</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Affected Districts</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {disasters.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'white' }}>{d.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Declared by: {d.declared_by}</div>
                    </td>
                    <td>{d.disaster_type}</td>
                    <td>
                      <span className={`badge ${d.severity === 'Critical' ? 'badge-critical' : 'badge-warning'}`}>
                        {d.severity}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{d.affected_districts}</td>
                    <td>
                      <span className={`badge ${d.status === 'Active' ? 'badge-critical' : d.status === 'Contained' ? 'badge-warning' : 'badge-org'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td>
                      <select
                        className="input-control"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto' }}
                        value={d.status}
                        onChange={(e) => handleUpdateStatus(d.id, e.target.value)}
                      >
                        <option value="Active">Active</option>
                        <option value="Contained">Contained</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Emergency Broadcast Alerts Feed */}
        <div className="glass-card">
          <h2 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio color="#3b82f6" /> Active Evacuation & Alert Feed
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {alerts.map((al) => (
              <div
                key={al.id}
                style={{
                  background: 'rgba(31, 41, 55, 0.6)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="badge badge-critical">{al.alert_level}</span>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{new Date(al.created_at).toLocaleTimeString()}</span>
                </div>
                <h4 style={{ color: 'white', fontSize: '0.95rem' }}>{al.title}</h4>
                <p style={{ color: '#d1d5db', fontSize: '0.82rem', marginTop: '4px' }}>{al.message}</p>
                <div style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '6px' }}>
                  Target Area: {al.affected_area}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Declare Disaster Modal */}
      {showDeclareModal && (
        <div className="modal-overlay" onClick={() => setShowDeclareModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', marginBottom: '16px' }}>Declare National Disaster Event</h2>
            <form onSubmit={handleDeclareDisaster}>
              <div className="form-group">
                <label>Disaster Event Title</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. Flash Floods in Sylhet Division"
                  value={newDisaster.title}
                  onChange={(e) => setNewDisaster({ ...newDisaster, title: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Disaster Type</label>
                  <select
                    className="input-control"
                    value={newDisaster.disaster_type}
                    onChange={(e) => setNewDisaster({ ...newDisaster, disaster_type: e.target.value })}
                  >
                    <option value="Flood">Flood</option>
                    <option value="Cyclone">Cyclone</option>
                    <option value="Earthquake">Earthquake</option>
                    <option value="Landslide">Landslide</option>
                    <option value="Severe Heatwave">Severe Heatwave</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Severity Level</label>
                  <select
                    className="input-control"
                    value={newDisaster.severity}
                    onChange={(e) => setNewDisaster({ ...newDisaster, severity: e.target.value })}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Affected Districts</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. Sylhet, Sunamganj, Netrokona"
                  value={newDisaster.affected_districts}
                  onChange={(e) => setNewDisaster({ ...newDisaster, affected_districts: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Expected Duration</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. 14 Days"
                  value={newDisaster.expected_duration}
                  onChange={(e) => setNewDisaster({ ...newDisaster, expected_duration: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Declare Disaster
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDeclareModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Broadcast Alert Modal */}
      {showAlertModal && (
        <div className="modal-overlay" onClick={() => setShowAlertModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', marginBottom: '16px' }}>Publish Emergency Alert Notice</h2>
            <form onSubmit={handlePublishAlert}>
              <div className="form-group">
                <label>Alert Notice Header</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. EVACUATION NOTICE FOR SYLHET BASIN"
                  value={newAlert.title}
                  onChange={(e) => setNewAlert({ ...newAlert, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Alert Level</label>
                <select
                  className="input-control"
                  value={newAlert.alert_level}
                  onChange={(e) => setNewAlert({ ...newAlert, alert_level: e.target.value })}
                >
                  <option value="Evacuation">Evacuation</option>
                  <option value="Severe">Severe</option>
                  <option value="Warning">Warning</option>
                  <option value="Information">Information</option>
                </select>
              </div>

              <div className="form-group">
                <label>Affected Region / Districts</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. Sunamganj & Sylhet District Lowlands"
                  value={newAlert.affected_area}
                  onChange={(e) => setNewAlert({ ...newAlert, affected_area: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Broadcast Message Details</label>
                <textarea
                  className="input-control"
                  rows="4"
                  required
                  placeholder="Enter detailed safety instructions..."
                  value={newAlert.message}
                  onChange={(e) => setNewAlert({ ...newAlert, message: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-danger" style={{ flex: 1 }}>
                  Broadcast Notice
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAlertModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
