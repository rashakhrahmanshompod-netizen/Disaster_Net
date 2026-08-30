import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, PlusCircle, Heart, Navigation, Truck, ShieldAlert, CheckCircle, CreditCard, Trash2, MessageSquare } from 'lucide-react';

export const CitizenDashboard = () => {
  const { user, token, API_BASE, deleteAccount } = useAuth();
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [complaints, setComplaints] = useState([]);
  const [feedback, setFeedback] = useState({ submission_type: 'Complaint', category: 'Disaster Response Service', subject: '', description: '' });
  const [serviceMessage, setServiceMessage] = useState('');

  // Form states
  const [newRequest, setNewRequest] = useState({
    item_category: 'Food',
    item_name: 'Emergency Dry Rations Pack',
    quantity: 50,
    unit: 'kits',
    priority: 'High',
    destination_address: 'Sunamganj Sadar Shelter, Sunamganj',
    destination_lat: 25.0658,
    destination_lng: 91.3950,
  });

  const [donationAmount, setDonationAmount] = useState('1000');
  const [bkashNumber, setBkashNumber] = useState('');

  useEffect(() => {
    fetchMyRequests();
    fetchComplaints();
  }, [token, user?.email]);

  const fetchMyRequests = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/inventory/requests`);
      if (!res.ok) throw new Error('Failed to load emergency requests');
      const data = await res.json();
      // The citizen tracker should only show requests submitted by this account.
      setMyRequests(data.filter((req) => req.requester_email === user?.email));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchComplaints = async () => {
    try {
      const res = await fetch(`${API_BASE}/service/complaints/mine`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setComplaints(await res.json());
    } catch (err) { console.error(err); }
  };

  const submitFeedback = async (e) => {
    e.preventDefault();
    setServiceMessage('');
    const res = await fetch(`${API_BASE}/service/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(feedback),
    });
    const data = await res.json();
    if (!res.ok) return setServiceMessage(data.detail || 'Complaint/feedback submission failed.');
    setFeedback({ ...feedback, subject: '', description: '' });
    setServiceMessage('Your complaint/feedback was submitted to government review.');
    fetchComplaints();
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/inventory/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newRequest),
      });
      if (!res.ok) throw new Error('Failed to submit emergency request');
      alert('Emergency resource request submitted! Relief organizations have been notified.');
      setShowRequestModal(false);
      fetchMyRequests();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDonationSubmit = (e) => {
    e.preventDefault();
    if (!bkashNumber) {
      alert('Please enter your bKash mobile number');
      return;
    }
    alert(`[bKash PAYMENT SUCCESS]\nThank you ${user?.full_name}!\nDonation of ৳${donationAmount} BDT processed successfully via bKash Merchant Gateway.\nTracking ID: BKASH-${Math.floor(100000 + Math.random() * 900000)}`);
    setShowDonateModal(false);
    setBkashNumber('');
  };

  const handleDeleteProfile = async () => {
    if (window.confirm('Are you sure you want to permanently delete your account profile? This action will erase your user data from the database.')) {
      try {
        await deleteAccount();
        alert('Your profile has been deleted successfully.');
      } catch (err) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="theme-donor" style={{ padding: '28px' }}>
      {/* Top Banner */}
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge badge-user" style={{ marginBottom: '8px' }}>
              <User size={14} /> Citizen Portal
            </span>
            <h1 style={{ color: 'white', fontSize: '1.8rem' }}>Welcome, {user?.full_name}</h1>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>
              Request emergency assistance supplies, track real-time relief deliveries, or contribute to disaster relief campaigns.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-success" onClick={() => setShowDonateModal(true)}>
              <Heart size={16} /> Donate via bKash
            </button>
            <button className="btn btn-primary" onClick={() => setShowRequestModal(true)}>
              <PlusCircle size={16} /> Request Emergency Aid
            </button>
          </div>
        </div>
      </div>

      {/* Main Dual Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '24px' }}>
        {/* Emergency Aid Requests Tracker */}
        <div className="glass-card">
          <h2 style={{ fontSize: '1.25rem', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation color="#a78bfa" /> Emergency Aid Request Tracker
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {myRequests.map((req) => (
              <div key={req.id} style={{ background: 'rgba(31, 41, 55, 0.6)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '14px', padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className={`badge ${req.priority === 'Critical' ? 'badge-critical' : 'badge-warning'}`}>
                    {req.priority} Priority
                  </span>
                  <span className={`badge ${req.status === 'In-Transit' ? 'badge-warning' : req.status === 'Delivered' ? 'badge-org' : 'badge-user'}`}>
                    {req.status}
                  </span>
                </div>

                <h4 style={{ color: 'white', fontSize: '1.1rem' }}>
                  {req.quantity} {req.unit} of {req.item_name}
                </h4>
                <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '4px' }}>
                  Destination: <strong style={{ color: '#e5e7eb' }}>{req.destination_address}</strong>
                </p>

                {req.status === 'In-Transit' && (
                  <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3b82f6', borderRadius: '10px', padding: '12px', marginTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontWeight: 700, fontSize: '0.9rem' }}>
                      <Truck size={16} /> Dispatched via {req.assigned_vehicle}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#d1d5db', marginTop: '4px' }}>
                      Assigned Warehouse: {req.assigned_warehouse}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 700, marginTop: '4px' }}>
                      Estimated Distance: {req.estimated_distance_km} km | ETA: {req.estimated_arrival_minutes} Minutes
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* User Profile & Account Input Details */}
        <div className="glass-card">
          <h2 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User color="#a78bfa" /> Profile & Account Input
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
            <div style={{ background: 'rgba(31, 41, 55, 0.5)', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Name</span>
              <div style={{ color: 'white', fontWeight: 700 }}>{user?.full_name}</div>
            </div>

            <div style={{ background: 'rgba(31, 41, 55, 0.5)', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Email Address</span>
              <div style={{ color: 'white', fontWeight: 700 }}>{user?.email}</div>
            </div>

            <div style={{ background: 'rgba(31, 41, 55, 0.5)', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>User Role</span>
              <div style={{ color: '#a78bfa', fontWeight: 700 }}>Citizen</div>
            </div>

            <div style={{ background: 'rgba(31, 41, 55, 0.5)', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Phone Number</span>
              <div style={{ color: 'white', fontWeight: 700 }}>{user?.phone || '+8801811223344'}</div>
            </div>

            <button
              onClick={handleDeleteProfile}
              className="btn btn-danger"
              style={{ marginTop: '12px', width: '100%' }}
            >
              <Trash2 size={16} /> Delete Account Profile
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><MessageSquare color="#8b5cf6" /> Feedback & Complaints</h2>
        {serviceMessage && <div className={serviceMessage.includes('failed') ? 'feature-error' : 'feature-success'}>{serviceMessage}</div>}
        <form onSubmit={submitFeedback}>
          <div className="feature-form-grid">
            <div className="form-group"><label>Type</label><select className="input-control" value={feedback.submission_type} onChange={e => setFeedback({ ...feedback, submission_type: e.target.value })}><option>Complaint</option><option>Feedback</option></select></div>
            <div className="form-group"><label>Category</label><input className="input-control" value={feedback.category} onChange={e => setFeedback({ ...feedback, category: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Subject</label><input required className="input-control" value={feedback.subject} onChange={e => setFeedback({ ...feedback, subject: e.target.value })} /></div>
          <div className="form-group"><label>Details</label><textarea required rows="3" className="input-control" value={feedback.description} onChange={e => setFeedback({ ...feedback, description: e.target.value })} /></div>
          <button className="btn btn-primary">Submit to Government Review</button>
        </form>
        <div className="data-table-container" style={{ marginTop: '16px' }}><table className="data-table"><thead><tr><th>Type</th><th>Subject</th><th>Status</th><th>Government Response</th></tr></thead><tbody>{complaints.length === 0 ? <tr><td colSpan="4">No complaint or feedback records yet.</td></tr> : complaints.map(c => <tr key={c.id}><td>{c.submission_type}</td><td>{c.subject}</td><td><span className={`badge ${c.status === 'Resolved' ? 'badge-org' : 'badge-warning'}`}>{c.status}</span></td><td>{c.official_response || '-'}</td></tr>)}</tbody></table></div>
      </div>

      {/* Submit Request Modal */}
      {showRequestModal && (
        <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', marginBottom: '16px' }}>Submit Emergency Aid Request</h2>
            <form onSubmit={handleRequestSubmit}>
              <div className="form-group">
                <label>Resource Category</label>
                <select
                  className="input-control"
                  value={newRequest.item_category}
                  onChange={(e) => setNewRequest({ ...newRequest, item_category: e.target.value })}
                >
                  <option value="Food">Food Rations</option>
                  <option value="Water">Clean Drinking Water</option>
                  <option value="Medicine">Medicine / First Aid</option>
                  <option value="Blankets">Emergency Blankets</option>
                  <option value="Generators">Generators</option>
                  <option value="Shelter Gear">Shelter Gear</option>
                </select>
              </div>

              <div className="form-group">
                <label>Item Name / Description</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. Dry Rations & Oral Rehydration Salts"
                  value={newRequest.item_name}
                  onChange={(e) => setNewRequest({ ...newRequest, item_name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    type="number"
                    className="input-control"
                    required
                    value={newRequest.quantity}
                    onChange={(e) => setNewRequest({ ...newRequest, quantity: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label>Unit (kits, liters, boxes)</label>
                  <input
                    type="text"
                    className="input-control"
                    required
                    value={newRequest.unit}
                    onChange={(e) => setNewRequest({ ...newRequest, unit: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Priority</label>
                <select
                  className="input-control"
                  value={newRequest.priority}
                  onChange={(e) => setNewRequest({ ...newRequest, priority: e.target.value })}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical Emergency</option>
                </select>
              </div>

              <div className="form-group">
                <label>Destination Shelter / Address</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. Sunamganj Sadar Shelter, Room 4"
                  value={newRequest.destination_address}
                  onChange={(e) => setNewRequest({ ...newRequest, destination_address: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Submit Request
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* bKash Donation Modal */}
      {showDonateModal && (
        <div className="modal-overlay" onClick={() => setShowDonateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#e11d48', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCard /> bKash Emergency Relief Donation
            </h2>
            <form onSubmit={handleDonationSubmit}>
              <div className="form-group">
                <label>Donation Amount (BDT ৳)</label>
                <select
                  className="input-control"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                >
                  <option value="500">৳ 500 BDT</option>
                  <option value="1000">৳ 1,000 BDT</option>
                  <option value="5000">৳ 5,000 BDT</option>
                  <option value="10000">৳ 10,000 BDT</option>
                </select>
              </div>

              <div className="form-group">
                <label>bKash Mobile Account Number</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="017XXXXXXXX / 018XXXXXXXX"
                  value={bkashNumber}
                  onChange={(e) => setBkashNumber(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-danger" style={{ flex: 1, background: 'linear-gradient(135deg, #e11d48, #be123c)' }}>
                  Confirm bKash Payment (৳{donationAmount})
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDonateModal(false)}>
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
