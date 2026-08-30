import React, { useEffect, useState } from 'react';
import { CreditCard, Download, HandCoins, History, MessageSquare, RefreshCw, RotateCcw, ShieldCheck, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const DonorDashboard = () => {
  const { token, API_BASE, user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [history, setHistory] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [selectedQr, setSelectedQr] = useState(null);
  const [payment, setPayment] = useState({ amount: 500, bkash_number: '' });
  const [refund, setRefund] = useState({ amount: '', reason: 'Donor requested refund' });
  const [feedback, setFeedback] = useState({ submission_type: 'Feedback', category: 'Campaign Transparency', subject: '', description: '' });
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [bkashConfig, setBkashConfig] = useState({ configured: true, simulation_active: false });
  const [simulationStep, setSimulationStep] = useState('details');
  const [simulationPayment, setSimulationPayment] = useState(null);
  const [simulationOtp, setSimulationOtp] = useState('');
  const [simulationPin, setSimulationPin] = useState('');
  const [paymentError, setPaymentError] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };
  const bkashConfigured = Boolean(bkashConfig.configured);
  const simulationActive = Boolean(bkashConfig.simulation_active);

  const extractError = (data, fallback) => {
    if (!data) return fallback;
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail) && data.detail.length > 0) return data.detail[0].msg || fallback;
    return fallback;
  };

  const load = async () => {
    try {
      const [c, h, f, b] = await Promise.all([
        fetch(`${API_BASE}/public/campaigns`),
        fetch(`${API_BASE}/donations/history`, { headers: authHeaders }),
        fetch(`${API_BASE}/service/complaints/mine`, { headers: authHeaders }),
        fetch(`${API_BASE}/bkash/config`, { headers: authHeaders }),
      ]);
      setCampaigns(c.ok ? await c.json() : []);
      setHistory(h.ok ? await h.json() : []);
      setComplaints(f.ok ? await f.json() : []);
      if (b.ok) setBkashConfig(await b.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    load();

    const params = new URLSearchParams(window.location.search);
    const bkashStatus = params.get('bkash');
    const trackingId = params.get('tracking_id');
    if (bkashStatus) {
      if (bkashStatus === 'success') {
        setMessage(`bKash payment confirmed successfully. Tracking ID: ${trackingId || '-'}`);
      } else if (bkashStatus === 'pending') {
        setMessage(`Payment is awaiting final confirmation. Tracking ID: ${trackingId || '-'}. Use Sync in donation history.`);
      } else if (bkashStatus === 'cancel' || bkashStatus === 'cancelled') {
        setMessage('bKash payment was cancelled.');
      } else {
        setMessage('bKash payment failed or could not be confirmed.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [token]);

  const openDonation = (campaign) => {
    setSelectedCampaign(campaign);
    setPayment({ amount: 500, bkash_number: '' });
    setSimulationStep('details');
    setSimulationPayment(null);
    setSimulationOtp('');
    setSimulationPin('');
    setMessage('');
    setPaymentError('');
  };

  const closeDonation = () => {
    setSelectedCampaign(null);
    setSimulationStep('details');
    setSimulationPayment(null);
    setSimulationOtp('');
    setSimulationPin('');
    setPaymentError('');
  };

  const donate = async (e) => {
    e.preventDefault();
    setPaymentError('');
    setProcessing(true);
    try {
      if (simulationActive) {
        const res = await fetch(`${API_BASE}/bkash/simulation/create`, {
          method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: selectedCampaign.id,
            amount: Number(payment.amount),
            bkash_number: payment.bkash_number,
          }),
        });
        const data = await res.json();
        if (!res.ok) return setPaymentError(extractError(data, 'Payment could not be started'));
        setSimulationPayment(data);
        setSimulationStep('otp');
        return;
      }

      const res = await fetch(`${API_BASE}/bkash/payments/create`, {
        method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: selectedCampaign.id, amount: Number(payment.amount) }),
      });
      const data = await res.json();
      if (!res.ok) return setPaymentError(extractError(data, 'Donation failed'));
      if (!data.bkash_url) return setPaymentError('bKash did not return a checkout URL.');
      window.location.href = data.bkash_url;
    } catch (err) {
      console.error(err);
      setPaymentError('Could not connect to the payment service.');
    } finally {
      setProcessing(false);
    }
  };

  const verifySimulationOtp = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setPaymentError('');
    try {
      const res = await fetch(`${API_BASE}/bkash/simulation/${simulationPayment.payment_id}/otp`, {
        method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: simulationOtp }),
      });
      const data = await res.json();
      if (!res.ok) return setPaymentError(extractError(data, 'OTP verification failed'));
      setSimulationStep('pin');
    } catch (err) {
      console.error(err);
      setPaymentError('Could not verify the OTP.');
    } finally {
      setProcessing(false);
    }
  };

  const confirmSimulationPayment = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setPaymentError('');
    try {
      const res = await fetch(`${API_BASE}/bkash/simulation/${simulationPayment.payment_id}/confirm`, {
        method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: simulationPin }),
      });
      const data = await res.json();
      if (!res.ok) return setPaymentError(extractError(data, 'Payment confirmation failed'));
      closeDonation();
      setMessage(`bKash payment completed successfully. Tracking ID: ${data.tracking_id}`);
      load();
    } catch (err) {
      console.error(err);
      setPaymentError('Could not confirm the payment.');
    } finally {
      setProcessing(false);
    }
  };

  const syncDonation = async (id) => {
    setMessage('');
    const item = history.find(d => d.id === id);
    const res = await fetch(`${API_BASE}/donations/${id}/sync`, { method: 'POST', headers: authHeaders });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Could not synchronize this transaction.');
    setMessage(`bKash payment status synchronized: ${data.payment_status}`);
    load();
  };

  const openRefund = (donation) => {
    const remaining = Math.max(0, Number(donation.available_amount ?? (Number(donation.amount || 0) - Number(donation.refunded_amount || 0))));
    setRefund({ amount: remaining.toFixed(2), reason: 'Donor requested refund' });
    setSelectedRefund(donation);
    setMessage('');
  };

  const submitRefund = async (e) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/donations/${selectedRefund.id}/refund`, {
        method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(refund.amount), reason: refund.reason }),
      });
      const data = await res.json();
      if (!res.ok) return setMessage(data.detail || 'Refund failed');
      setMessage(`Refund completed. Transaction: ${data.refund_trx_id || '-'}`);
      setSelectedRefund(null);
      load();
    } catch (err) {
      console.error(err);
      setMessage('Could not process the refund.');
    } finally {
      setProcessing(false);
    }
  };

  const submitFeedback = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/service/complaints`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(feedback),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.detail || 'Submission failed');
    setMessage('Your feedback was submitted successfully.');
    setFeedback({ ...feedback, subject: '', description: '' });
    load();
  };

  const downloadReceipt = async (id, trackingId) => {
    const res = await fetch(`${API_BASE}/donations/${id}/receipt`, { headers: authHeaders });
    if (!res.ok) return setMessage('Could not download receipt.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `receipt_${trackingId}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const total = history.reduce((sum, d) => sum + Number(d.net_amount ?? d.amount ?? 0), 0);
  const isError = message.toLowerCase().includes('failed') || message.toLowerCase().includes('could not') || message.toLowerCase().includes('cancelled') || message.toLowerCase().includes('incorrect');

  return (
    <div className="theme-donor" style={{ padding: '28px' }}>
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <span className="badge badge-user" style={{ marginBottom: '8px' }}><HandCoins size={14} /> Donor Portal</span>
        <h1 style={{ color: 'white', fontSize: '1.8rem' }}>Welcome, {user?.full_name}</h1>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>Support verified campaigns, track every contribution, and review how funds are used.</p>
      </div>

      {!simulationActive && !bkashConfigured && <div className="feature-error">bKash payment service is currently unavailable.</div>}
      {message && <div className={isError ? 'feature-error' : 'feature-success'}>{message}</div>}

      <div className="feature-stat-grid">
        <div className="glass-card feature-stat"><HandCoins size={24} color="#10b981" /><div><strong>৳{total.toLocaleString()}</strong><span>Net Donated</span></div></div>
        <div className="glass-card feature-stat"><History size={24} color="#3b82f6" /><div><strong>{history.length}</strong><span>Transactions</span></div></div>
        <div className="glass-card feature-stat"><ShieldCheck size={24} color="#f59e0b" /><div><strong>{campaigns.filter(c => c.status === 'Active').length}</strong><span>Active Campaigns</span></div></div>
        <div className="glass-card feature-stat"><MessageSquare size={24} color="#8b5cf6" /><div><strong>{complaints.length}</strong><span>Feedback Records</span></div></div>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <h2 className="feature-card-title"><HandCoins color="#10b981" /> Disaster Response Campaigns</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {campaigns.map((c) => (
            <div key={c.id} style={{ background: 'rgba(31,41,55,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><h3 style={{ color: 'white', fontSize: '1rem' }}>{c.title}</h3><span className="badge badge-org">{c.status}</span></div>
              <div style={{ color: '#34d399', fontSize: '0.8rem', marginTop: '4px' }}>{c.organization_name}</div>
              <p style={{ color: '#d1d5db', fontSize: '0.82rem', lineHeight: 1.5, marginTop: '8px' }}>{c.description}</p>
              <div style={{ color: '#9ca3af', fontSize: '0.82rem', marginTop: '10px' }}>Raised <strong style={{ color: 'white' }}>৳{Number(c.collected_amount).toLocaleString()}</strong> of ৳{Number(c.target_amount).toLocaleString()}</div>
              <div style={{ color: '#9ca3af', fontSize: '0.82rem', marginTop: '4px' }}>Utilized <strong style={{ color: 'white' }}>৳{Number(c.utilized_amount || 0).toLocaleString()}</strong> · Available ৳{Math.max(0, Number(c.collected_amount || 0) - Number(c.utilized_amount || 0)).toLocaleString()}</div>
              <button className="btn btn-success" style={{ width: '100%', marginTop: '12px' }} onClick={() => openDonation(c)}><CreditCard size={16} /> Donate with bKash</button>
            </div>
          ))}
        </div>
      </div>

      <div className="feature-two-column">
        <div className="glass-card">
          <h2 className="feature-card-title"><History color="#3b82f6" /> Donation History & Receipts</h2>
          <div className="data-table-container"><table className="data-table"><thead><tr><th>Tracking</th><th>Amount</th><th>Utilized</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {history.map((d) => <tr key={d.id}>
              <td><strong style={{ color: 'white' }}>{d.tracking_id}</strong><div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{d.bkash_transaction_id?.startsWith('PENDING-') ? (d.bkash_payment_id || 'Awaiting bKash') : d.bkash_transaction_id}</div></td>
              <td>৳{Number(d.net_amount ?? d.amount).toLocaleString()}{Number(d.refunded_amount || 0) > 0 && <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Refunded ৳{Number(d.refunded_amount).toLocaleString()}</div>}</td>
              <td>৳{Number(d.utilized_amount || 0).toLocaleString()}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Available ৳{Number(d.available_amount ?? d.net_amount ?? d.amount).toLocaleString()}</div></td>
              <td><span className="badge badge-org">{d.payment_status}</span></td>
              <td><div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['Completed', 'Partially Refunded'].includes(d.payment_status) && <button className="btn btn-secondary" style={{ padding: '5px 9px' }} onClick={() => setSelectedQr(d)} title="Show donor QR"><QrCode size={14} /></button>}
                <button className="btn btn-secondary" style={{ padding: '5px 9px' }} onClick={() => downloadReceipt(d.id, d.tracking_id)} title="Download receipt"><Download size={14} /></button>
                {d.bkash_payment_id && <button className="btn btn-secondary" style={{ padding: '5px 9px' }} onClick={() => syncDonation(d.id)} title="Sync payment status"><RefreshCw size={14} /></button>}
                {d.bkash_payment_id && ['Completed', 'Partially Refunded'].includes(d.payment_status) && <button className="btn btn-danger" style={{ padding: '5px 9px' }} onClick={() => openRefund(d)} title="Refund payment"><RotateCcw size={14} /></button>}
              </div></td>
            </tr>)}
          </tbody></table></div>
        </div>

        <div className="glass-card">
          <h2 className="feature-card-title"><MessageSquare color="#8b5cf6" /> Feedback & Complaints</h2>
          <form onSubmit={submitFeedback}>
            <div className="feature-form-grid">
              <div className="form-group"><label>Type</label><select className="input-control" value={feedback.submission_type} onChange={e => setFeedback({ ...feedback, submission_type: e.target.value })}><option>Feedback</option><option>Complaint</option></select></div>
              <div className="form-group"><label>Category</label><input className="input-control" value={feedback.category} onChange={e => setFeedback({ ...feedback, category: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Subject</label><input required className="input-control" value={feedback.subject} onChange={e => setFeedback({ ...feedback, subject: e.target.value })} /></div>
            <div className="form-group"><label>Details</label><textarea required rows="3" className="input-control" value={feedback.description} onChange={e => setFeedback({ ...feedback, description: e.target.value })} /></div>
            <button className="btn btn-primary" type="submit">Submit</button>
          </form>
          {complaints.length > 0 && <div style={{ marginTop: '14px', color: '#9ca3af', fontSize: '0.82rem' }}>Latest status: <strong style={{ color: 'white' }}>{complaints[0].status}</strong>{complaints[0].official_response ? ` — ${complaints[0].official_response}` : ''}</div>}
        </div>
      </div>

      {selectedCampaign && (
        <div className="modal-overlay" onClick={closeDonation}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ color: 'white', marginBottom: '6px' }}>Donate to {selectedCampaign.title}</h2>

            {paymentError && <div className="feature-error" style={{ marginBottom: '12px' }}>{paymentError}</div>}

            {simulationStep === 'details' && <>
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '18px' }}>
                {simulationActive
                  ? 'Enter the bKash payment details below. The wallet number is masked in the database, and OTP/PIN values are not stored as payment credentials.'
                  : 'You will be redirected to the secure bKash checkout page to enter your wallet number, OTP and PIN. DisasterNet never stores your PIN or OTP.'}
              </p>
              <form onSubmit={donate}>
                <div className="form-group"><label>Amount (BDT)</label><input type="number" min="1" step="0.01" required className="input-control" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} /></div>
                {simulationActive && <div className="form-group"><label>bKash Mobile Number</label><input required className="input-control" placeholder="01XXXXXXXXX" value={payment.bkash_number} onChange={e => setPayment({ ...payment, bkash_number: e.target.value })} /></div>}
                <div style={{ display: 'flex', gap: '10px' }}><button className="btn btn-danger" disabled={processing} type="submit" style={{ flex: 1 }}>{processing ? 'Processing...' : simulationActive ? 'Start bKash Payment' : 'Continue to bKash'}</button><button className="btn btn-secondary" type="button" onClick={closeDonation}>Cancel</button></div>
              </form>
            </>}

            {simulationActive && simulationStep === 'otp' && <form onSubmit={verifySimulationOtp}>
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '18px' }}>Enter the verification OTP.</p>
              <div className="form-group"><label>OTP</label><input required inputMode="numeric" maxLength="6" className="input-control" value={simulationOtp} onChange={e => setSimulationOtp(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: '10px' }}><button className="btn btn-danger" disabled={processing} type="submit" style={{ flex: 1 }}>{processing ? 'Verifying...' : 'Verify OTP'}</button><button className="btn btn-secondary" type="button" onClick={closeDonation}>Cancel</button></div>
            </form>}

            {simulationActive && simulationStep === 'pin' && <form onSubmit={confirmSimulationPayment}>
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '18px' }}>Enter the payment PIN to confirm.</p>
              <div className="form-group"><label>PIN</label><input required type="password" inputMode="numeric" maxLength="5" className="input-control" value={simulationPin} onChange={e => setSimulationPin(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: '10px' }}><button className="btn btn-danger" disabled={processing} type="submit" style={{ flex: 1 }}>{processing ? 'Confirming...' : 'Confirm bKash Payment'}</button><button className="btn btn-secondary" type="button" onClick={closeDonation}>Cancel</button></div>
            </form>}
          </div>
        </div>
      )}

      {selectedQr && (
        <div className="modal-overlay" onClick={() => setSelectedQr(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ color: 'white', marginBottom: '6px' }}>Donor QR Code</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '14px' }}>A verified volunteer can scan this QR to record how your donation is utilized for the campaign or an assigned mission.</p>
            <div style={{ textAlign: 'center' }}>
              <img src={`${API_BASE}/public/donation-qr/${encodeURIComponent(selectedQr.tracking_id)}.png`} alt="Donor donation QR code" style={{ width: '220px', maxWidth: '100%', background: 'white', padding: '10px', borderRadius: '12px' }} />
              <div style={{ color: 'white', fontWeight: 700, marginTop: '10px', wordBreak: 'break-all' }}>{selectedQr.tracking_id}</div>
              <div style={{ color: '#9ca3af', fontSize: '0.82rem', marginTop: '6px' }}>Available for utilization: ৳{Number(selectedQr.available_amount ?? selectedQr.net_amount ?? selectedQr.amount).toLocaleString()}</div>
            </div>
            <button className="btn btn-secondary" type="button" style={{ width: '100%', marginTop: '16px' }} onClick={() => setSelectedQr(null)}>Close</button>
          </div>
        </div>
      )}

      {selectedRefund && (
        <div className="modal-overlay" onClick={() => setSelectedRefund(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ color: 'white', marginBottom: '6px' }}>Refund Donation</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '18px' }}>{selectedRefund.bkash_payment_id?.startsWith('SIM-PAY-') ? 'This refund updates the saved donation, campaign balance, receipt and transparency data.' : 'The refund is processed through the bKash Refund API and saved in your donation history.'}</p>
            <form onSubmit={submitRefund}>
              <div className="form-group"><label>Refund Amount (BDT)</label><input type="number" min="0.01" step="0.01" required className="input-control" value={refund.amount} onChange={e => setRefund({ ...refund, amount: e.target.value })} /></div>
              <div className="form-group"><label>Reason</label><input required maxLength="255" className="input-control" value={refund.reason} onChange={e => setRefund({ ...refund, reason: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: '10px' }}><button className="btn btn-danger" disabled={processing} type="submit" style={{ flex: 1 }}>{processing ? 'Processing...' : 'Confirm Refund'}</button><button className="btn btn-secondary" type="button" onClick={() => setSelectedRefund(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
