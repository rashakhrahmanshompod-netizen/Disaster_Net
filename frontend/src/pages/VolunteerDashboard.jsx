import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, ClipboardList, FileText, HandCoins, IdCard, MapPin, PackageCheck, QrCode, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const VolunteerDashboard = () => {
  const { token, API_BASE, user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [missions, setMissions] = useState([]);
  const [reports, setReports] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [donorUtilizations, setDonorUtilizations] = useState([]);
  const [donorFund, setDonorFund] = useState({ donor_tracking_id: '', mission_id: '', amount: 100, notes: '' });
  const [donorPreview, setDonorPreview] = useState(null);
  const [identityFile, setIdentityFile] = useState(null);
  const [distribution, setDistribution] = useState({ beneficiary_qr: '', mission_id: '', aid_type: 'Food Package', quantity: 1, unit: 'package', notes: '' });
  const [report, setReport] = useState({ mission_id: '', report_type: 'Field', latitude: '', longitude: '', rescued_people: 0, summary: '' });
  const [reportPhoto, setReportPhoto] = useState(null);
  const [message, setMessage] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [donorCameraActive, setDonorCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const donorVideoRef = useRef(null);
  const donorStreamRef = useRef(null);
  const donorScanTimerRef = useRef(null);
  const authHeaders = { Authorization: `Bearer ${token}` };

  const load = async () => {
    try {
      const [p, m, r, d, u] = await Promise.all([
        fetch(`${API_BASE}/volunteers/profile`, { headers: authHeaders }),
        fetch(`${API_BASE}/volunteers/missions`, { headers: authHeaders }),
        fetch(`${API_BASE}/volunteers/reports`, { headers: authHeaders }),
        fetch(`${API_BASE}/volunteers/distributions`, { headers: authHeaders }),
        fetch(`${API_BASE}/volunteers/donor-utilizations`, { headers: authHeaders }),
      ]);
      if (p.ok) setProfile(await p.json());
      if (m.ok) setMissions(await m.json());
      if (r.ok) setReports(await r.json());
      if (d.ok) setDistributions(await d.json());
      if (u.ok) setDonorUtilizations(await u.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load(); return () => { stopCamera(); stopDonorCamera(); }; }, [token]);

  const saveProfile = async (e) => {
    e.preventDefault();
    const body = {
      nid_number: profile.nid_number || null,
      profession: profile.profession || null,
      skills: profile.skills || '',
      availability: profile.availability || 'Available',
      district: profile.district || null,
      emergency_contact_name: profile.emergency_contact_name || null,
      emergency_contact_phone: profile.emergency_contact_phone || null,
    };
    const res = await fetch(`${API_BASE}/volunteers/profile`, { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Profile update failed');
    setProfile(data); setMessage('Volunteer profile saved.');
  };

  const uploadIdentity = async () => {
    if (!identityFile) return setMessage('Choose a JPG, PNG or PDF identity document first.');
    const form = new FormData(); form.append('identity_file', identityFile);
    const res = await fetch(`${API_BASE}/volunteers/identity`, { method: 'POST', headers: authHeaders, body: form });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Identity upload failed');
    setProfile(data); setIdentityFile(null); setMessage('Identity document uploaded for verification.');
  };

  const acceptMission = async (id) => {
    const res = await fetch(`${API_BASE}/volunteers/missions/${id}/accept`, { method: 'POST', headers: authHeaders });
    const data = await res.json(); if (!res.ok) return setMessage(data.detail || 'Mission acceptance failed');
    setMessage('Mission accepted.'); load();
  };

  const updateMission = async (id, status) => {
    const res = await fetch(`${API_BASE}/volunteers/missions/${id}/status`, { method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const data = await res.json(); if (!res.ok) return setMessage(data.detail || 'Mission update failed');
    setMessage(`Mission status changed to ${status}.`); load();
  };

  const submitDistribution = async (e) => {
    e.preventDefault();
    const body = { ...distribution, mission_id: distribution.mission_id ? Number(distribution.mission_id) : null, quantity: Number(distribution.quantity) };
    const res = await fetch(`${API_BASE}/volunteers/distributions`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Aid distribution could not be recorded');
    setDistribution({ ...distribution, beneficiary_qr: '', notes: '' }); setMessage('Aid distribution recorded. Duplicate protection is active.'); load();
  };

  const previewDonorFunds = async (trackingCode = donorFund.donor_tracking_id) => {
    const code = String(trackingCode || '').trim();
    if (!code) return setMessage('Enter or scan a donor QR code first.');
    const res = await fetch(`${API_BASE}/volunteers/donor-utilizations/preview/${encodeURIComponent(code)}`, { headers: authHeaders });
    const data = await res.json();
    if (!res.ok) { setDonorPreview(null); return setMessage(data.detail || 'Donor QR could not be verified.'); }
    setDonorFund(prev => ({ ...prev, donor_tracking_id: data.tracking_id }));
    setDonorPreview(data);
    setMessage(`Donor QR verified for ${data.donor_name}. Available: ৳${Number(data.available_amount || 0).toLocaleString()}.`);
  };

  const submitDonorUtilization = async (e) => {
    e.preventDefault();
    const body = {
      donor_tracking_id: donorFund.donor_tracking_id.trim(),
      mission_id: donorFund.mission_id ? Number(donorFund.mission_id) : null,
      amount: Number(donorFund.amount),
      notes: donorFund.notes || null,
    };
    const res = await fetch(`${API_BASE}/volunteers/donor-utilizations`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Donor fund utilization could not be recorded.');
    setMessage(`Recorded ৳${Number(data.amount).toLocaleString()} from ${data.donor_name} for ${data.mission_title || data.campaign_title}.`);
    setDonorFund({ donor_tracking_id: '', mission_id: '', amount: 100, notes: '' });
    setDonorPreview(null);
    load();
  };

  const stopDonorCamera = () => {
    if (donorScanTimerRef.current) clearInterval(donorScanTimerRef.current);
    donorScanTimerRef.current = null;
    if (donorStreamRef.current) donorStreamRef.current.getTracks().forEach(track => track.stop());
    donorStreamRef.current = null;
    setDonorCameraActive(false);
  };

  const startDonorCamera = async () => {
    if (!('BarcodeDetector' in window)) return setMessage('Camera QR detection is not supported in this browser. Use the Donor QR code input with a scanner or type the tracking ID.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      donorStreamRef.current = stream; setDonorCameraActive(true);
      setTimeout(() => { if (donorVideoRef.current) donorVideoRef.current.srcObject = stream; }, 0);
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      donorScanTimerRef.current = setInterval(async () => {
        if (!donorVideoRef.current || donorVideoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(donorVideoRef.current);
          if (codes[0]?.rawValue) {
            const value = codes[0].rawValue;
            setDonorFund(prev => ({ ...prev, donor_tracking_id: value }));
            stopDonorCamera();
            previewDonorFunds(value);
          }
        } catch { /* keep scanning */ }
      }, 700);
    } catch { setMessage('Camera permission was not granted.'); stopDonorCamera(); }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return setMessage('GPS is not supported by this browser.');
    navigator.geolocation.getCurrentPosition(
      pos => setReport({ ...report, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }),
      () => setMessage('GPS permission was not granted.')
    );
  };

  const submitReport = async (e) => {
    e.preventDefault();
    const form = new FormData();
    form.append('summary', report.summary);
    form.append('report_type', report.report_type);
    if (report.mission_id) form.append('mission_id', report.mission_id);
    if (report.latitude) form.append('latitude', report.latitude);
    if (report.longitude) form.append('longitude', report.longitude);
    form.append('rescued_people', String(Number(report.rescued_people || 0)));
    if (reportPhoto) form.append('photo', reportPhoto);
    const res = await fetch(`${API_BASE}/volunteers/reports`, { method: 'POST', headers: authHeaders, body: form });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Report submission failed');
    setReport({ mission_id: '', report_type: 'Field', latitude: '', longitude: '', rescued_people: 0, summary: '' }); setReportPhoto(null); setMessage('Field/rescue report submitted.'); load();
  };

  const stopCamera = () => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    if (!('BarcodeDetector' in window)) return setMessage('Camera QR detection is not supported in this browser. Use the QR code input with a scanner or type the code.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; setCameraActive(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 0);
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      scanTimerRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            setDistribution(prev => ({ ...prev, beneficiary_qr: codes[0].rawValue }));
            setMessage('Beneficiary QR scanned successfully.'); stopCamera();
          }
        } catch { /* keep scanning */ }
      }, 700);
    } catch { setMessage('Camera permission was not granted.'); stopCamera(); }
  };

  if (!profile) return <div style={{ padding: '28px', color: '#9ca3af' }}>Loading volunteer portal...</div>;
  const verified = profile.verification_status === 'Verified';

  return (
    <div className="theme-organization" style={{ padding: '28px' }}>
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
          <div><span className="badge badge-org" style={{ marginBottom: '8px' }}><Users size={14} /> Volunteer Field Portal</span><h1 style={{ color: 'white', fontSize: '1.8rem' }}>{user?.full_name}</h1><p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>Manage verification, missions, QR-based distributions and field reporting.</p></div>
          <span className={`badge ${verified ? 'badge-org' : 'badge-warning'}`}>{profile.verification_status}</span>
        </div>
      </div>
      {message && <div className={message.includes('failed') || message.includes('not ') || message.includes('could not') ? 'feature-error' : 'feature-success'}>{message}</div>}

      <div className="feature-stat-grid">
        <div className="glass-card feature-stat"><ShieldCheck size={24} color="#10b981" /><div><strong>{profile.verification_status}</strong><span>Verification</span></div></div>
        <div className="glass-card feature-stat"><ClipboardList size={24} color="#3b82f6" /><div><strong>{missions.length}</strong><span>Assigned Missions</span></div></div>
        <div className="glass-card feature-stat"><PackageCheck size={24} color="#f59e0b" /><div><strong>{distributions.length}</strong><span>Completed Distributions</span></div></div>
        <div className="glass-card feature-stat"><FileText size={24} color="#8b5cf6" /><div><strong>{reports.length}</strong><span>Field Reports</span></div></div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><IdCard color="#10b981" /> Volunteer Registration & Verification</h2>
          <form onSubmit={saveProfile}>
            <div className="feature-form-grid"><div className="form-group"><label>NID / Identity Number</label><input className="input-control" value={profile.nid_number || ''} onChange={e => setProfile({ ...profile, nid_number: e.target.value })} /></div><div className="form-group"><label>Profession</label><input className="input-control" value={profile.profession || ''} onChange={e => setProfile({ ...profile, profession: e.target.value })} /></div></div>
            <div className="form-group"><label>Professional / Response Skills</label><input className="input-control" placeholder="First Aid, Rescue, Driving, Logistics" value={profile.skills || ''} onChange={e => setProfile({ ...profile, skills: e.target.value })} /></div>
            <div className="feature-form-grid"><div className="form-group"><label>Availability</label><select className="input-control" value={profile.availability || 'Available'} onChange={e => setProfile({ ...profile, availability: e.target.value })}><option>Available</option><option>Unavailable</option></select></div><div className="form-group"><label>Current District</label><input className="input-control" value={profile.district || ''} onChange={e => setProfile({ ...profile, district: e.target.value })} /></div></div>
            <div className="feature-form-grid"><div className="form-group"><label>Emergency Contact Name</label><input className="input-control" value={profile.emergency_contact_name || ''} onChange={e => setProfile({ ...profile, emergency_contact_name: e.target.value })} /></div><div className="form-group"><label>Emergency Contact Phone</label><input className="input-control" value={profile.emergency_contact_phone || ''} onChange={e => setProfile({ ...profile, emergency_contact_phone: e.target.value })} /></div></div>
            <button className="btn btn-success">Save Volunteer Profile</button>
          </form>
          <div style={{ marginTop: '18px' }}><div className="form-group"><label>Identity Verification File (JPG, PNG, PDF)</label><input type="file" className="input-control" accept="image/png,image/jpeg,application/pdf" onChange={e => setIdentityFile(e.target.files?.[0] || null)} /></div><button type="button" className="btn btn-secondary" onClick={uploadIdentity}>Upload Identity Verification</button>{profile.identity_document && <span style={{ color: '#9ca3af', fontSize: '0.8rem', marginLeft: '10px' }}>Document submitted</span>}</div>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><ClipboardList color="#3b82f6" /> Assigned Missions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {missions.length === 0 && <div style={{ color: '#9ca3af' }}>No missions assigned yet.</div>}
            {missions.map(m => <div key={m.id} style={{ background: 'rgba(31,41,55,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><h3 style={{ color: 'white', fontSize: '1rem' }}>{m.title}</h3><span className={`badge ${m.status === 'Completed' ? 'badge-org' : 'badge-warning'}`}>{m.status}</span></div><div style={{ color: '#60a5fa', fontSize: '0.82rem', marginTop: '5px' }}><MapPin size={13} style={{ verticalAlign: 'middle' }} /> {m.location}</div><p style={{ color: '#d1d5db', fontSize: '0.82rem', lineHeight: 1.5, marginTop: '7px' }}>{m.description}</p><div style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: '5px' }}>Required skills: {m.required_skills || 'General response'} | Assigned by: {m.assigned_by_name}</div><div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>{m.status === 'Assigned' && <button className="btn btn-success" style={{ padding: '6px 10px' }} onClick={() => acceptMission(m.id)}>Accept Mission</button>}{['Accepted','In Progress'].includes(m.status) && <><button className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={() => updateMission(m.id, 'In Progress')}>In Progress</button><button className="btn btn-success" style={{ padding: '6px 10px' }} onClick={() => updateMission(m.id, 'Completed')}>Complete</button></>}</div></div>)}
          </div>
        </div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><QrCode color="#f59e0b" /> QR-Based Aid Distribution</h2>
          {!verified && <div className="feature-error">Your profile must be verified before field distribution should be performed.</div>}
          <form onSubmit={submitDistribution}>
            <div className="form-group"><label>Beneficiary QR Code</label><input required className="input-control" value={distribution.beneficiary_qr} onChange={e => setDistribution({ ...distribution, beneficiary_qr: e.target.value })} /></div>
            {!cameraActive ? <button type="button" className="btn btn-secondary" onClick={startCamera}><Camera size={16} /> Start Camera QR Scan</button> : <><video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxHeight: '260px', marginTop: '10px', borderRadius: '12px' }} /><button type="button" className="btn btn-secondary" style={{ marginTop: '8px' }} onClick={stopCamera}>Stop Camera</button></>}
            <div className="feature-form-grid" style={{ marginTop: '12px' }}><div className="form-group"><label>Mission</label><select className="input-control" value={distribution.mission_id} onChange={e => setDistribution({ ...distribution, mission_id: e.target.value })}><option value="">General distribution</option>{missions.filter(m => m.status !== 'Assigned').map(m => <option value={m.id} key={m.id}>{m.title}</option>)}</select></div><div className="form-group"><label>Aid Type</label><input className="input-control" value={distribution.aid_type} onChange={e => setDistribution({ ...distribution, aid_type: e.target.value })} /></div></div>
            <div className="feature-form-grid"><div className="form-group"><label>Quantity</label><input type="number" min="0.01" step="0.01" className="input-control" value={distribution.quantity} onChange={e => setDistribution({ ...distribution, quantity: e.target.value })} /></div><div className="form-group"><label>Unit</label><input className="input-control" value={distribution.unit} onChange={e => setDistribution({ ...distribution, unit: e.target.value })} /></div></div>
            <div className="form-group"><label>Notes</label><input className="input-control" value={distribution.notes} onChange={e => setDistribution({ ...distribution, notes: e.target.value })} /></div>
            <button className="btn btn-success" disabled={!verified}>Record Distribution</button>
          </form>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><FileText color="#8b5cf6" /> Field & Rescue Reports</h2>
          <form onSubmit={submitReport}>
            <div className="feature-form-grid"><div className="form-group"><label>Report Type</label><select className="input-control" value={report.report_type} onChange={e => setReport({ ...report, report_type: e.target.value })}><option>Field</option><option>Rescue</option></select></div><div className="form-group"><label>Mission</label><select className="input-control" value={report.mission_id} onChange={e => setReport({ ...report, mission_id: e.target.value })}><option value="">General report</option>{missions.map(m => <option value={m.id} key={m.id}>{m.title}</option>)}</select></div></div>
            <div className="feature-form-grid"><div className="form-group"><label>Latitude</label><input className="input-control" value={report.latitude} onChange={e => setReport({ ...report, latitude: e.target.value })} /></div><div className="form-group"><label>Longitude</label><input className="input-control" value={report.longitude} onChange={e => setReport({ ...report, longitude: e.target.value })} /></div></div>
            <button type="button" className="btn btn-secondary" onClick={useCurrentLocation}><MapPin size={16} /> Use GPS Location</button>
            {report.report_type === 'Rescue' && <div className="form-group" style={{ marginTop: '12px' }}><label>People Rescued</label><input type="number" min="0" className="input-control" value={report.rescued_people} onChange={e => setReport({ ...report, rescued_people: e.target.value })} /></div>}
            <div className="form-group" style={{ marginTop: '12px' }}><label>Mission Summary</label><textarea required rows="4" className="input-control" value={report.summary} onChange={e => setReport({ ...report, summary: e.target.value })} /></div>
            <div className="form-group"><label>Field Photograph</label><input type="file" accept="image/png,image/jpeg,image/webp" className="input-control" onChange={e => setReportPhoto(e.target.files?.[0] || null)} /></div>
            <button className="btn btn-primary">Submit Report</button>
          </form>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <h2 className="feature-card-title"><HandCoins color="#10b981" /> Donor QR Code</h2>
        {!verified && <div className="feature-error">Your profile must be verified before donor funds can be recorded as utilized.</div>}
        <form onSubmit={submitDonorUtilization}>
          <div className="form-group"><label>Donor QR Code / Tracking ID</label><input required className="input-control" value={donorFund.donor_tracking_id} onChange={e => { setDonorFund({ ...donorFund, donor_tracking_id: e.target.value }); setDonorPreview(null); }} /></div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!donorCameraActive ? <button type="button" className="btn btn-secondary" onClick={startDonorCamera}><Camera size={16} /> Scan Donor QR</button> : <button type="button" className="btn btn-secondary" onClick={stopDonorCamera}>Stop Camera</button>}
            <button type="button" className="btn btn-secondary" onClick={() => previewDonorFunds()}>Check Donor QR</button>
          </div>
          {donorCameraActive && <video ref={donorVideoRef} autoPlay playsInline style={{ width: '100%', maxHeight: '260px', marginTop: '10px', borderRadius: '12px' }} />}
          {donorPreview && <div style={{ marginTop: '12px', color: '#d1d5db', fontSize: '0.85rem', lineHeight: 1.7 }}><strong style={{ color: 'white' }}>{donorPreview.donor_name}</strong><br />Campaign: {donorPreview.campaign_title}<br />Donated: ৳{Number(donorPreview.original_amount).toLocaleString()} · Already utilized: ৳{Number(donorPreview.utilized_amount).toLocaleString()} · Available: <strong style={{ color: 'white' }}>৳{Number(donorPreview.available_amount).toLocaleString()}</strong></div>}
          <div className="feature-form-grid" style={{ marginTop: '12px' }}>
            <div className="form-group"><label>Mission</label><select className="input-control" value={donorFund.mission_id} onChange={e => setDonorFund({ ...donorFund, mission_id: e.target.value })}><option value="">Campaign / General Distribution</option>{missions.filter(m => m.status !== 'Assigned').map(m => <option value={m.id} key={m.id}>{m.title}</option>)}</select></div>
            <div className="form-group"><label>Amount Utilized (BDT)</label><input type="number" min="0.01" step="0.01" required className="input-control" value={donorFund.amount} onChange={e => setDonorFund({ ...donorFund, amount: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Utilization Notes</label><input className="input-control" placeholder="Food, medicine, transport, relief materials..." value={donorFund.notes} onChange={e => setDonorFund({ ...donorFund, notes: e.target.value })} /></div>
          <button className="btn btn-success" disabled={!verified}>Record Donor Fund Utilization</button>
        </form>
      </div>

      <div className="glass-card">
        <h2 className="feature-card-title"><CheckCircle color="#10b981" /> Completed Distribution Records</h2>
        <div className="data-table-container"><table className="data-table"><thead><tr><th>Donor</th><th>Amount Utilized</th><th>Campaign / Mission</th><th>Tracking ID</th><th>Time</th></tr></thead><tbody>{donorUtilizations.length === 0 ? <tr><td colSpan="5">No donor fund utilization has been recorded yet.</td></tr> : donorUtilizations.map(d => <tr key={d.id}><td><strong style={{ color: 'white' }}>{d.donor_name}</strong></td><td>৳{Number(d.amount).toLocaleString()}</td><td>{d.campaign_title}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{d.mission_title || 'General campaign distribution'}</div></td><td>{d.tracking_id}</td><td>{new Date(d.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
        <h3 style={{ color: 'white', fontSize: '1rem', marginTop: '18px', marginBottom: '10px' }}>Beneficiary Aid Records</h3>
        <div className="data-table-container"><table className="data-table"><thead><tr><th>Beneficiary QR</th><th>Aid</th><th>Quantity</th><th>Time</th><th>Beneficiary Confirmed</th></tr></thead><tbody>{distributions.map(d => <tr key={d.id}><td>{d.beneficiary_qr}</td><td>{d.aid_type}</td><td>{d.quantity} {d.unit}</td><td>{new Date(d.distributed_at).toLocaleString()}</td><td><span className={`badge ${d.confirmed_by_beneficiary ? 'badge-org' : 'badge-warning'}`}>{d.confirmed_by_beneficiary ? 'Confirmed' : 'Pending'}</span></td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
};
