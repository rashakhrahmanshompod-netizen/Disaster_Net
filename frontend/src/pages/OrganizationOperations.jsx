import React, { useEffect, useState } from 'react';
import { CheckCircle, ClipboardList, HandCoins, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const OrganizationOperations = () => {
  const { token, API_BASE } = useAuth();
  const [volunteers, setVolunteers] = useState([]);
  const [missions, setMissions] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [assistance, setAssistance] = useState([]);
  const [message, setMessage] = useState('');
  const [organizationVerification, setOrganizationVerification] = useState(null);
  const [mission, setMission] = useState({ title: '', mission_type: 'Relief Distribution', location: '', required_skills: '', description: '', assigned_volunteer_id: '', disaster_id: null });
  const [campaign, setCampaign] = useState({ title: '', description: '', target_amount: 100000, disaster_id: null, end_date: '' });
  const [allocation, setAllocation] = useState({ campaign_id: '', category: 'Relief Supplies', amount: 0, description: '' });
  const authHeaders = { Authorization: `Bearer ${token}` };

  const load = async () => {
    try {
      const [verification, v, m, c, a] = await Promise.all([
        fetch(`${API_BASE}/organization/verification`, { headers: authHeaders }),
        fetch(`${API_BASE}/organization/volunteers`, { headers: authHeaders }),
        fetch(`${API_BASE}/organization/missions`, { headers: authHeaders }),
        fetch(`${API_BASE}/organization/campaigns`, { headers: authHeaders }),
        fetch(`${API_BASE}/operations/assistance-requests`, { headers: authHeaders }),
      ]);
      if (verification.ok) setOrganizationVerification(await verification.json());
      if (v.ok) setVolunteers(await v.json()); else setVolunteers([]);
      if (m.ok) setMissions(await m.json());
      if (c.ok) setCampaigns(await c.json());
      if (a.ok) setAssistance(await a.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load(); }, [token]);

  const assignMission = async (e) => {
    e.preventDefault();
    if (organizationVerification?.verification_status !== 'Verified') return setMessage('Government verification is required before assigning missions.');
    const res = await fetch(`${API_BASE}/organization/missions`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mission, assigned_volunteer_id: Number(mission.assigned_volunteer_id), disaster_id: mission.disaster_id || null }),
    });
    const data = await res.json(); if (!res.ok) return setMessage(data.detail || 'Mission assignment failed');
    setMission({ ...mission, title: '', location: '', required_skills: '', description: '', assigned_volunteer_id: '' }); setMessage('Volunteer mission assigned.'); load();
  };

  const createCampaign = async (e) => {
    e.preventDefault();
    if (organizationVerification?.verification_status !== 'Verified') return setMessage('Government verification is required before publishing campaigns.');
    const res = await fetch(`${API_BASE}/organization/campaigns`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...campaign, target_amount: Number(campaign.target_amount), disaster_id: campaign.disaster_id || null, end_date: campaign.end_date || null }),
    });
    const data = await res.json(); if (!res.ok) return setMessage(data.detail || 'Campaign creation failed');
    setCampaign({ ...campaign, title: '', description: '' }); setMessage('Disaster response campaign published.'); load();
  };

  const allocateFunds = async (e) => {
    e.preventDefault();
    if (organizationVerification?.verification_status !== 'Verified') return setMessage('Government verification is required before allocating campaign funds.');
    const res = await fetch(`${API_BASE}/organization/campaigns/${allocation.campaign_id}/allocations`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ category: allocation.category, amount: Number(allocation.amount), description: allocation.description }),
    });
    const data = await res.json(); if (!res.ok) return setMessage(data.detail || 'Allocation failed');
    setAllocation({ ...allocation, amount: 0, description: '' }); setMessage('Campaign funds allocated transparently.'); load();
  };

  const updateAssistance = async (id, status) => {
    const res = await fetch(`${API_BASE}/operations/assistance-requests/${id}/status?status_value=${encodeURIComponent(status)}`, { method: 'PATCH', headers: authHeaders });
    if (res.ok) { setMessage(`Assistance request updated to ${status}.`); load(); }
  };

  const isVerifiedOrganization = organizationVerification?.verification_status === 'Verified';
  const verified = volunteers.filter(v => v.verification_status === 'Verified' && String(v.availability).toLowerCase() === 'available');

  return (
    <div style={{ marginTop: '24px' }}>
      {message && <div className={message.includes('failed') ? 'feature-error' : 'feature-success'}>{message}</div>}

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><ShieldCheck color="#10b981" /> Government Verification Status</h2>
          <div style={{ color: '#d1d5db', lineHeight: 1.8 }}>
            <div><strong style={{ color: 'white' }}>NGO:</strong> {organizationVerification?.organization_name || '-'}</div>
            <div><strong style={{ color: 'white' }}>Status:</strong> <span className={`badge ${isVerifiedOrganization ? 'badge-org' : 'badge-warning'}`}>{organizationVerification?.verification_status || 'Pending'}</span></div>
            <div><strong style={{ color: 'white' }}>Reviewed By:</strong> {organizationVerification?.verified_by || 'Government review pending'}</div>
          </div>
          {!isVerifiedOrganization && <div style={{ marginTop: '12px', color: '#9ca3af', fontSize: '0.82rem' }}>Mission assignment and campaign actions become available after government approval.</div>}
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><ClipboardList color="#3b82f6" /> Assign Volunteer Mission</h2>
          <form onSubmit={assignMission}>
            <div className="feature-form-grid"><div className="form-group"><label>Mission Title</label><input required className="input-control" value={mission.title} onChange={e => setMission({ ...mission, title: e.target.value })} /></div><div className="form-group"><label>Mission Type</label><select className="input-control" value={mission.mission_type} onChange={e => setMission({ ...mission, mission_type: e.target.value })}><option>Relief Distribution</option><option>Rescue</option><option>Medical Support</option><option>Assessment</option><option>Logistics</option></select></div></div>
            <div className="feature-form-grid"><div className="form-group"><label>Verified Volunteer</label><select required className="input-control" value={mission.assigned_volunteer_id} onChange={e => setMission({ ...mission, assigned_volunteer_id: e.target.value })}><option value="">Select by skills / availability</option>{verified.map(v => <option value={v.user_id} key={v.user_id}>{v.full_name} — {v.skills || 'General'} — {v.district || 'No district'}</option>)}</select></div><div className="form-group"><label>Disaster Location</label><input required className="input-control" value={mission.location} onChange={e => setMission({ ...mission, location: e.target.value })} /></div></div>
            <div className="form-group"><label>Required Skills</label><input className="input-control" value={mission.required_skills} onChange={e => setMission({ ...mission, required_skills: e.target.value })} /></div>
            <div className="form-group"><label>Mission Instructions</label><textarea required rows="3" className="input-control" value={mission.description} onChange={e => setMission({ ...mission, description: e.target.value })} /></div>
            <button className="btn btn-success" disabled={!isVerifiedOrganization}>Assign Mission</button>
          </form>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <h2 className="feature-card-title"><Users color="#10b981" /> Government-Verified Volunteers</h2>
        <div className="data-table-container"><table className="data-table"><thead><tr><th>Volunteer</th><th>Skills</th><th>Location</th><th>Availability</th><th>Status</th></tr></thead><tbody>
          {volunteers.map(v => <tr key={v.user_id}><td><strong style={{ color: 'white' }}>{v.full_name}</strong><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{v.email}</div></td><td>{v.skills || '-'}</td><td>{v.district || '-'}</td><td>{v.availability}</td><td><span className="badge badge-org">{v.verification_status}</span></td></tr>)}
        </tbody></table></div>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <h2 className="feature-card-title"><Users color="#3b82f6" /> Field Mission Status</h2>
        <div className="data-table-container"><table className="data-table"><thead><tr><th>Mission</th><th>Location</th><th>Volunteer ID</th><th>Assigned By</th><th>Status</th></tr></thead><tbody>{missions.map(m => <tr key={m.id}><td><strong style={{ color: 'white' }}>{m.title}</strong><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{m.mission_type}</div></td><td>{m.location}</td><td>#{m.assigned_volunteer_id}</td><td>{m.assigned_by_name}</td><td><span className={`badge ${m.status === 'Completed' ? 'badge-org' : 'badge-warning'}`}>{m.status}</span></td></tr>)}</tbody></table></div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><HandCoins color="#10b981" /> Campaign Management</h2>
          <form onSubmit={createCampaign}>
            <div className="form-group"><label>Campaign Title</label><input required className="input-control" value={campaign.title} onChange={e => setCampaign({ ...campaign, title: e.target.value })} /></div>
            <div className="form-group"><label>Campaign Description</label><textarea required rows="3" className="input-control" value={campaign.description} onChange={e => setCampaign({ ...campaign, description: e.target.value })} /></div>
            <div className="feature-form-grid"><div className="form-group"><label>Target Amount (BDT)</label><input type="number" min="1" className="input-control" value={campaign.target_amount} onChange={e => setCampaign({ ...campaign, target_amount: e.target.value })} /></div><div className="form-group"><label>End Date</label><input type="date" className="input-control" value={campaign.end_date} onChange={e => setCampaign({ ...campaign, end_date: e.target.value })} /></div></div>
            <button className="btn btn-success" disabled={!isVerifiedOrganization}>Publish Campaign</button>
          </form>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><CheckCircle color="#f59e0b" /> Record Fund Allocation</h2>
          <form onSubmit={allocateFunds}>
            <div className="form-group"><label>Campaign</label><select required className="input-control" value={allocation.campaign_id} onChange={e => setAllocation({ ...allocation, campaign_id: e.target.value })}><option value="">Select campaign</option>{campaigns.map(c => <option value={c.id} key={c.id}>{c.title} — Available ৳{Number(c.collected_amount - c.utilized_amount).toLocaleString()}</option>)}</select></div>
            <div className="feature-form-grid"><div className="form-group"><label>Category</label><input className="input-control" value={allocation.category} onChange={e => setAllocation({ ...allocation, category: e.target.value })} /></div><div className="form-group"><label>Amount</label><input type="number" min="0.01" step="0.01" className="input-control" value={allocation.amount} onChange={e => setAllocation({ ...allocation, amount: e.target.value })} /></div></div>
            <div className="form-group"><label>Utilization Details</label><textarea required rows="3" className="input-control" value={allocation.description} onChange={e => setAllocation({ ...allocation, description: e.target.value })} /></div>
            <button className="btn btn-primary" disabled={!isVerifiedOrganization}>Save Allocation</button>
          </form>
        </div>
      </div>

      <div className="glass-card">
        <h2 className="feature-card-title"><Users color="#8b5cf6" /> Beneficiary Assistance Queue</h2>
        <div className="data-table-container"><table className="data-table"><thead><tr><th>Request</th><th>Family</th><th>Status</th><th>Update</th></tr></thead><tbody>{assistance.map(a => <tr key={a.id}><td><strong style={{ color: 'white' }}>{a.request_type}</strong><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{a.details}</div></td><td>{a.family_size}</td><td><span className={`badge ${a.status === 'Fulfilled' ? 'badge-org' : 'badge-warning'}`}>{a.status}</span></td><td><select className="input-control" value={a.status} onChange={e => updateAssistance(a.id, e.target.value)}><option>Pending</option><option>Approved</option><option>In Progress</option><option>Fulfilled</option><option>Rejected</option></select></td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
};
