import React, { useEffect, useState } from 'react';
import { AlertTriangle, BarChart2, CheckCircle, MessageSquare, ShieldAlert, ShieldCheck, Siren, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const GovernmentOversight = () => {
  const { token, API_BASE } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [fraud, setFraud] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [sos, setSos] = useState([]);
  const [message, setMessage] = useState('');
  const [volunteers, setVolunteers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [verificationError, setVerificationError] = useState('');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const load = async () => {
    try {
      const [a, f, c, s, queue] = await Promise.all([
        fetch(`${API_BASE}/government/analytics`, { headers: authHeaders }),
        fetch(`${API_BASE}/government/fraud-alerts`, { headers: authHeaders }),
        fetch(`${API_BASE}/government/complaints`, { headers: authHeaders }),
        fetch(`${API_BASE}/government/sos`, { headers: authHeaders }),
        fetch(`${API_BASE}/government/verification-queue`, { headers: authHeaders }),
      ]);
      if (a.ok) setAnalytics(await a.json());
      if (f.ok) setFraud(await f.json());
      if (c.ok) setComplaints(await c.json());
      if (s.ok) setSos(await s.json());

      if (queue.ok) {
        const data = await queue.json();
        setVolunteers(Array.isArray(data.volunteers) ? data.volunteers : []);
        setOrganizations(Array.isArray(data.organizations) ? data.organizations : []);
        setVerificationError('');
      } else {
        // Compatibility fallback for an already-running backend while the page reloads.
        const [v, o] = await Promise.all([
          fetch(`${API_BASE}/government/volunteers`, { headers: authHeaders }),
          fetch(`${API_BASE}/government/organizations`, { headers: authHeaders }),
        ]);
        if (v.ok && o.ok) {
          setVolunteers(await v.json());
          setOrganizations(await o.json());
          setVerificationError('');
        } else {
          setVerificationError('Verification accounts could not be loaded. Restart the latest DisasterNet backend and refresh this page.');
        }
      }
    } catch (err) {
      console.error(err);
      setVerificationError('Verification accounts could not be loaded. Restart the latest DisasterNet backend and refresh this page.');
    }
  };

  useEffect(() => { load(); }, [token]);

  const viewVolunteerIdentity = async (fileName) => {
    if (!fileName) return;
    const res = await fetch(`${API_BASE}/field-files/${encodeURIComponent(fileName)}`, { headers: authHeaders });
    if (!res.ok) return setMessage('Unable to open the volunteer identity document.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const verifyVolunteer = async (id, approved) => {
    const res = await fetch(`${API_BASE}/government/volunteers/${id}/verify?approved=${approved}`, { method: 'PATCH', headers: authHeaders });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Volunteer verification failed.');
    setMessage(`Volunteer marked ${data.verification_status} by government authority.`);
    load();
  };

  const verifyOrganization = async (id, approved) => {
    const res = await fetch(`${API_BASE}/government/organizations/${id}/verify?approved=${approved}`, { method: 'PATCH', headers: authHeaders });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'NGO verification failed.');
    setMessage(`NGO marked ${data.verification_status} by government authority.`);
    load();
  };

  const reviewFraud = async (id) => {
    const res = await fetch(`${API_BASE}/government/fraud-alerts/${id}`, { method: 'PATCH', headers: authHeaders });
    if (res.ok) { setMessage('Fraud alert marked reviewed.'); load(); }
  };

  const updateComplaint = async (item, status) => {
    const response = window.prompt('Official response / action taken:', item.official_response || '');
    if (response === null) return;
    const res = await fetch(`${API_BASE}/government/complaints/${item.id}`, { method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, official_response: response }) });
    if (res.ok) { setMessage('Complaint/feedback updated.'); load(); }
  };

  const updateSOS = async (id, status) => {
    const res = await fetch(`${API_BASE}/government/sos/${id}/status?status_value=${encodeURIComponent(status)}`, { method: 'PATCH', headers: authHeaders });
    if (res.ok) { setMessage(`SOS status changed to ${status}.`); load(); }
  };

  if (!analytics) return <div style={{ padding: '28px', color: '#9ca3af' }}>Loading government analytics...</div>;
  const field = analytics.field_operations || {};
  const donations = analytics.donations || {};
  const service = analytics.public_service || {};

  return (
    <div className="theme-government" style={{ padding: '28px' }}>
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <span className="badge badge-govt" style={{ marginBottom: '8px' }}><BarChart2 size={14} /> Analytics, Fraud & Public Service Oversight</span>
        <h1 style={{ color: 'white', fontSize: '1.8rem' }}>Government Operations Intelligence</h1>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>Monitor field activity, NGO performance, donations, utilization, suspicious activity, complaints and SOS response.</p>
      </div>
      {message && <div className="feature-success">{message}</div>}
      {verificationError && <div className="feature-error">{verificationError}</div>}

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><ShieldCheck color="#10b981" /> Volunteer Verification</h2>
          <div className="data-table-container"><table className="data-table"><thead><tr><th>Volunteer</th><th>Skills</th><th>ID</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {volunteers.length === 0 && <tr><td colSpan="5">No registered volunteers are waiting in the verification list.</td></tr>}
            {volunteers.map(v => <tr key={v.user_id}><td><strong style={{ color: 'white' }}>{v.full_name}</strong><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{v.email}</div></td><td>{v.skills || '-'}</td><td>{v.identity_document ? <button className="btn btn-secondary" style={{ padding: '5px 8px' }} onClick={() => viewVolunteerIdentity(v.identity_document)}>View ID</button> : 'Not uploaded'}</td><td><span className={`badge ${v.verification_status === 'Verified' ? 'badge-org' : 'badge-warning'}`}>{v.verification_status}</span></td><td><div style={{ display: 'flex', gap: '6px' }}><button className="btn btn-success" style={{ padding: '5px 8px' }} disabled={!v.identity_document} onClick={() => verifyVolunteer(v.user_id, true)}>Accept</button><button className="btn btn-danger" style={{ padding: '5px 8px' }} onClick={() => verifyVolunteer(v.user_id, false)}>Reject</button></div></td></tr>)}
          </tbody></table></div>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><ShieldCheck color="#3b82f6" /> NGO Verification</h2>
          <div className="data-table-container"><table className="data-table"><thead><tr><th>NGO</th><th>Contact</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {organizations.length === 0 && <tr><td colSpan="4">No registered NGOs are waiting in the verification list.</td></tr>}
            {organizations.map(o => <tr key={o.organization_user_id}><td><strong style={{ color: 'white' }}>{o.organization_name || o.full_name}</strong><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{o.full_name}</div></td><td>{o.email}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{o.phone || '-'}</div></td><td><span className={`badge ${o.verification_status === 'Verified' ? 'badge-org' : 'badge-warning'}`}>{o.verification_status}</span></td><td><div style={{ display: 'flex', gap: '6px' }}><button className="btn btn-success" style={{ padding: '5px 8px' }} onClick={() => verifyOrganization(o.organization_user_id, true)}>Accept</button><button className="btn btn-danger" style={{ padding: '5px 8px' }} onClick={() => verifyOrganization(o.organization_user_id, false)}>Reject</button></div></td></tr>)}
          </tbody></table></div>
        </div>
      </div>

      <div className="feature-stat-grid">
        <div className="glass-card feature-stat"><Users size={24} color="#10b981" /><div><strong>{field.verified_volunteers || 0}/{field.registered_volunteers || 0}</strong><span>Verified Volunteers</span></div></div>
        <div className="glass-card feature-stat"><CheckCircle size={24} color="#3b82f6" /><div><strong>{field.completed_missions || 0}</strong><span>Completed Missions</span></div></div>
        <div className="glass-card feature-stat"><BarChart2 size={24} color="#f59e0b" /><div><strong>৳{Number(donations.total_bdt || 0).toLocaleString()}</strong><span>Total Donations</span></div></div>
        <div className="glass-card feature-stat"><AlertTriangle size={24} color="#ef4444" /><div><strong>{service.open_fraud_alerts || 0}</strong><span>Open Fraud Alerts</span></div></div>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <h2 className="feature-card-title"><BarChart2 color="#f59e0b" /> Donation Summary</h2>
        <div className="data-table-container"><table className="data-table"><thead><tr><th>Donor</th><th>Donated To</th><th>Amount</th><th>Utilized</th><th>Tracking ID</th></tr></thead><tbody>
          {(analytics.donation_summary || []).length === 0 ? <tr><td colSpan="5">No completed donations have been recorded yet.</td></tr> : (analytics.donation_summary || []).map(d => <tr key={d.id}><td><strong style={{ color: 'white' }}>{d.donor_name}</strong></td><td>{d.campaign_title}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{d.organization_name}</div></td><td>৳{Number(d.net_amount).toLocaleString()}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{d.payment_status}</div></td><td>৳{Number(d.utilized_amount || 0).toLocaleString()}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Available ৳{Number(d.available_amount || 0).toLocaleString()}</div></td><td>{d.tracking_id}</td></tr>)}
        </tbody></table></div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><ShieldAlert color="#ef4444" /> Fraud Detection Alerts</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{fraud.length === 0 && <div style={{ color: '#9ca3af' }}>No suspicious activity alerts recorded.</div>}{fraud.map(f => <div key={f.id} style={{ background: 'rgba(31,41,55,0.6)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '14px' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><strong style={{ color: 'white' }}>{f.alert_type}</strong><span className={`badge ${f.status === 'Reviewed' ? 'badge-org' : 'badge-critical'}`}>{f.status}</span></div><p style={{ color: '#d1d5db', fontSize: '0.82rem', marginTop: '6px' }}>{f.description}</p>{f.status === 'Open' && <button className="btn btn-secondary" style={{ marginTop: '8px', padding: '5px 9px' }} onClick={() => reviewFraud(f.id)}>Mark Reviewed</button>}</div>)}</div>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><Siren color="#ef4444" /> Active Citizen SOS Requests</h2>
          <div className="data-table-container"><table className="data-table"><thead><tr><th>Location</th><th>Message</th><th>Status</th><th>Action</th></tr></thead><tbody>{sos.map(s => <tr key={s.id}><td>{s.location}</td><td>{s.message}</td><td><span className={`badge ${s.status === 'Resolved' ? 'badge-org' : 'badge-critical'}`}>{s.status}</span></td><td><select className="input-control" value={s.status} onChange={e => updateSOS(s.id, e.target.value)}><option>Active</option><option>Responding</option><option>Resolved</option></select></td></tr>)}</tbody></table></div>
        </div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><MessageSquare color="#8b5cf6" /> Complaint & Feedback Review</h2>
          <div className="data-table-container"><table className="data-table"><thead><tr><th>From</th><th>Type / Category</th><th>Complaint / Feedback</th><th>Status</th><th>Government Action</th></tr></thead><tbody>{complaints.length === 0 ? <tr><td colSpan="5">No complaints or feedback have been submitted.</td></tr> : complaints.map(c => <tr key={c.id}><td>{c.submitted_by}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{c.user_role}</div></td><td>{c.submission_type}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{c.category}</div></td><td><strong style={{ color: 'white' }}>{c.subject}</strong><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{c.description}</div>{c.official_response && <div style={{ color: '#34d399', fontSize: '0.75rem', marginTop: '5px' }}>Response: {c.official_response}</div>}</td><td><span className={`badge ${c.status === 'Resolved' ? 'badge-org' : 'badge-warning'}`}>{c.status}</span></td><td><select className="input-control" value={c.status} onChange={e => updateComplaint(c, e.target.value)}><option>Submitted</option><option>Under Review</option><option>Resolved</option><option>Rejected</option></select></td></tr>)}</tbody></table></div>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><BarChart2 color="#3b82f6" /> NGO Performance & Resource Utilization</h2>
          <div className="data-table-container"><table className="data-table"><thead><tr><th>Organization</th><th>Campaigns</th><th>Missions</th><th>Completed</th></tr></thead><tbody>{analytics.ngo_performance?.map((n, i) => <tr key={`${n.organization}-${i}`}><td><strong style={{ color: 'white' }}>{n.organization}</strong></td><td>{n.campaigns}</td><td>{n.missions}</td><td>{n.completed_missions}</td></tr>)}</tbody></table></div>
          <div style={{ marginTop: '14px', color: '#9ca3af', fontSize: '0.82rem', lineHeight: 1.8 }}>Inventory quantity: <strong style={{ color: 'white' }}>{Number(analytics.resource_utilization?.inventory_quantity || 0).toLocaleString()}</strong><br />Resource requests: <strong style={{ color: 'white' }}>{analytics.resource_utilization?.resource_requests || 0}</strong><br />Funds utilized: <strong style={{ color: 'white' }}>৳{Number(donations.utilized_bdt || 0).toLocaleString()}</strong><br />Aid distributions: <strong style={{ color: 'white' }}>{field.aid_distributions || 0}</strong></div>
        </div>
      </div>
    </div>
  );
};
