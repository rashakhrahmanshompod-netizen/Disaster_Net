import React, { useEffect, useState } from 'react';
import { CheckCircle, HeartHandshake, MessageSquare, QrCode, Siren, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const BeneficiaryDashboard = () => {
  const { token, API_BASE, user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [sosList, setSosList] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [requestForm, setRequestForm] = useState({ request_type: 'Food & Water', details: '', family_size: 1, disaster_id: null });
  const [sos, setSos] = useState({ message: '', location: '', latitude: null, longitude: null });
  const [feedback, setFeedback] = useState({ submission_type: 'Complaint', category: 'Aid Service', subject: '', description: '' });
  const [message, setMessage] = useState('');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const load = async () => {
    try {
      const [p, r, d, s, c] = await Promise.all([
        fetch(`${API_BASE}/beneficiary/profile`, { headers: authHeaders }),
        fetch(`${API_BASE}/beneficiary/requests`, { headers: authHeaders }),
        fetch(`${API_BASE}/beneficiary/distributions`, { headers: authHeaders }),
        fetch(`${API_BASE}/beneficiary/sos`, { headers: authHeaders }),
        fetch(`${API_BASE}/service/complaints/mine`, { headers: authHeaders }),
      ]);
      if (p.ok) setProfile(await p.json());
      if (r.ok) setRequests(await r.json());
      if (d.ok) setDistributions(await d.json());
      if (s.ok) setSosList(await s.json());
      if (c.ok) setComplaints(await c.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load(); }, [token]);

  const saveProfile = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/beneficiary/profile`, {
      method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_size: Number(profile.family_size), district: profile.district, address: profile.address, vulnerability_notes: profile.vulnerability_notes }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Profile update failed');
    setProfile(data); setMessage('Family information updated.');
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/beneficiary/requests`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestForm, family_size: Number(requestForm.family_size) }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Assistance request failed');
    setRequestForm({ ...requestForm, details: '' }); setMessage('Assistance request submitted.'); load();
  };

  const useLocation = () => {
    if (!navigator.geolocation) return setMessage('Location access is not supported by this browser.');
    navigator.geolocation.getCurrentPosition(
      (pos) => setSos({ ...sos, latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setMessage('Location access was not allowed. You can still enter the location manually.')
    );
  };

  const submitSOS = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/beneficiary/sos`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(sos),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'SOS submission failed');
    setSos({ message: '', location: '', latitude: null, longitude: null }); setMessage('SOS request submitted to government monitoring.'); load();
  };

  const confirmAid = async (id) => {
    const res = await fetch(`${API_BASE}/beneficiary/distributions/${id}/confirm`, { method: 'POST', headers: authHeaders });
    if (res.ok) { setMessage('Received assistance confirmed.'); load(); }
  };

  const submitFeedback = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/service/complaints`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(feedback),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Submission failed');
    setFeedback({ ...feedback, subject: '', description: '' }); setMessage('Your complaint/feedback was submitted.'); load();
  };

  if (!profile) return <div style={{ padding: '28px', color: '#9ca3af' }}>Loading beneficiary portal...</div>;

  return (
    <div className="theme-beneficiary" style={{ padding: '28px' }}>
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <span className="badge badge-user" style={{ marginBottom: '8px' }}><HeartHandshake size={14} /> Citizen / Beneficiary Portal</span>
        <h1 style={{ color: 'white', fontSize: '1.8rem' }}>{user?.full_name}</h1>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>Request assistance, use your aid collection QR, submit SOS alerts, and confirm services received.</p>
      </div>

      {message && <div className={message.includes('failed') ? 'feature-error' : 'feature-success'}>{message}</div>}

      <div className="feature-stat-grid">
        <div className="glass-card feature-stat"><QrCode size={24} color="#8b5cf6" /><div><strong>{profile.qr_code.slice(0, 12)}…</strong><span>Aid Collection ID</span></div></div>
        <div className="glass-card feature-stat"><Users size={24} color="#3b82f6" /><div><strong>{profile.family_size}</strong><span>Family Members</span></div></div>
        <div className="glass-card feature-stat"><HeartHandshake size={24} color="#10b981" /><div><strong>{requests.length}</strong><span>Assistance Requests</span></div></div>
        <div className="glass-card feature-stat"><Siren size={24} color="#ef4444" /><div><strong>{sosList.filter(s => s.status !== 'Resolved').length}</strong><span>Active SOS</span></div></div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><QrCode color="#8b5cf6" /> Aid Collection QR Code</h2>
          <div style={{ textAlign: 'center' }}>
            <img src={`${API_BASE}/public/qr/${profile.qr_code}.png`} alt="Beneficiary QR code" style={{ width: '210px', maxWidth: '100%', borderRadius: '12px', background: 'white', padding: '10px' }} />
            <div style={{ color: 'white', fontWeight: 700, marginTop: '10px', wordBreak: 'break-all' }}>{profile.qr_code}</div>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', marginTop: '6px' }}>Show this QR to a verified volunteer before aid is recorded.</p>
          </div>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><Users color="#3b82f6" /> Family Information</h2>
          <form onSubmit={saveProfile}>
            <div className="feature-form-grid">
              <div className="form-group"><label>Family Size</label><input type="number" min="1" className="input-control" value={profile.family_size} onChange={e => setProfile({ ...profile, family_size: e.target.value })} /></div>
              <div className="form-group"><label>District</label><input className="input-control" value={profile.district || ''} onChange={e => setProfile({ ...profile, district: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Address</label><input className="input-control" value={profile.address || ''} onChange={e => setProfile({ ...profile, address: e.target.value })} /></div>
            <div className="form-group"><label>Vulnerability / Special Needs</label><textarea rows="3" className="input-control" value={profile.vulnerability_notes || ''} onChange={e => setProfile({ ...profile, vulnerability_notes: e.target.value })} /></div>
            <button className="btn btn-primary">Update Family Information</button>
          </form>
        </div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><HeartHandshake color="#10b981" /> Request Assistance</h2>
          <form onSubmit={submitRequest}>
            <div className="feature-form-grid">
              <div className="form-group"><label>Assistance Type</label><select className="input-control" value={requestForm.request_type} onChange={e => setRequestForm({ ...requestForm, request_type: e.target.value })}><option>Food & Water</option><option>Medicine</option><option>Shelter</option><option>Rescue</option><option>Other</option></select></div>
              <div className="form-group"><label>Family Size</label><input type="number" min="1" className="input-control" value={requestForm.family_size} onChange={e => setRequestForm({ ...requestForm, family_size: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Request Details</label><textarea required rows="3" className="input-control" value={requestForm.details} onChange={e => setRequestForm({ ...requestForm, details: e.target.value })} /></div>
            <button className="btn btn-success">Submit Assistance Request</button>
          </form>
          <div className="data-table-container" style={{ marginTop: '16px' }}><table className="data-table"><thead><tr><th>Type</th><th>Status</th><th>Date</th></tr></thead><tbody>{requests.map(r => <tr key={r.id}><td>{r.request_type}</td><td><span className={`badge ${r.status === 'Fulfilled' ? 'badge-org' : 'badge-warning'}`}>{r.status}</span></td><td>{new Date(r.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><Siren color="#ef4444" /> Emergency SOS</h2>
          <form onSubmit={submitSOS}>
            <div className="form-group"><label>Current Location</label><input required className="input-control" value={sos.location} onChange={e => setSos({ ...sos, location: e.target.value })} /></div>
            <div className="form-group"><label>Emergency Details</label><textarea required rows="3" className="input-control" value={sos.message} onChange={e => setSos({ ...sos, message: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: '10px' }}><button type="button" className="btn btn-secondary" onClick={useLocation}>Use GPS</button><button className="btn btn-danger" type="submit">Submit SOS</button></div>
          </form>
          {sosList.length > 0 && <div style={{ marginTop: '14px', color: '#9ca3af', fontSize: '0.82rem' }}>Latest SOS status: <strong style={{ color: 'white' }}>{sosList[0].status}</strong></div>}
        </div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><CheckCircle color="#10b981" /> Received Assistance</h2>
          <div className="data-table-container"><table className="data-table"><thead><tr><th>Aid</th><th>Quantity</th><th>Received</th><th>Confirm</th></tr></thead><tbody>{distributions.map(d => <tr key={d.id}><td>{d.aid_type}</td><td>{d.quantity} {d.unit}</td><td>{new Date(d.distributed_at).toLocaleString()}</td><td>{d.confirmed_by_beneficiary ? <span className="badge badge-org">Confirmed</span> : <button className="btn btn-success" style={{ padding: '5px 9px' }} onClick={() => confirmAid(d.id)}>Confirm</button>}</td></tr>)}</tbody></table></div>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><MessageSquare color="#8b5cf6" /> Feedback & Complaints</h2>
          <form onSubmit={submitFeedback}>
            <div className="feature-form-grid"><div className="form-group"><label>Type</label><select className="input-control" value={feedback.submission_type} onChange={e => setFeedback({ ...feedback, submission_type: e.target.value })}><option>Complaint</option><option>Feedback</option></select></div><div className="form-group"><label>Category</label><input className="input-control" value={feedback.category} onChange={e => setFeedback({ ...feedback, category: e.target.value })} /></div></div>
            <div className="form-group"><label>Subject</label><input required className="input-control" value={feedback.subject} onChange={e => setFeedback({ ...feedback, subject: e.target.value })} /></div>
            <div className="form-group"><label>Details</label><textarea required rows="3" className="input-control" value={feedback.description} onChange={e => setFeedback({ ...feedback, description: e.target.value })} /></div>
            <button className="btn btn-primary">Submit</button>
          </form>
          {complaints.length > 0 && <div style={{ marginTop: '14px', color: '#9ca3af', fontSize: '0.82rem' }}>Latest status: <strong style={{ color: 'white' }}>{complaints[0].status}</strong>{complaints[0].official_response ? ` — ${complaints[0].official_response}` : ''}</div>}
        </div>
      </div>
    </div>
  );
};
