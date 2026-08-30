import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Activity, AlertTriangle, BarChart2, Building, CreditCard, Package, PlusCircle, RefreshCw, Truck } from 'lucide-react';

const emptyRequest = {
  item_category: 'Medicine',
  item_name: '',
  quantity: 1,
  unit: 'boxes',
  priority: 'High',
  destination_address: '',
};

const emptyExpenditure = {
  category: 'Medicine Procurement',
  amount: '',
  description: '',
  report_period: '',
};

export const HospitalDashboard = () => {
  const { user, token, API_BASE } = useAuth();
  const [status, setStatus] = useState(null);
  const [supplies, setSupplies] = useState([]);
  const [expenditures, setExpenditures] = useState([]);
  const [patientForm, setPatientForm] = useState({ current_patients: 0, critical_patients: 0, new_emergency_patients: 0 });
  const [capacityForm, setCapacityForm] = useState({ total_beds: 0, occupied_beds: 0, emergency_beds: 0, staff_on_duty: 0, ambulances_available: 0, emergency_capacity_status: 'Available' });
  const [requestForm, setRequestForm] = useState(emptyRequest);
  const [expenditureForm, setExpenditureForm] = useState(emptyExpenditure);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const getError = async (res, fallback) => {
    try {
      const data = await res.json();
      if (Array.isArray(data.detail)) return data.detail.map((item) => item.msg).join(', ');
      return data.detail || fallback;
    } catch {
      return fallback;
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const [statusRes, suppliesRes, expenditureRes] = await Promise.all([
        fetch(`${API_BASE}/hospital/status`, { headers: authHeaders }),
        fetch(`${API_BASE}/hospital/incoming-supplies`, { headers: authHeaders }),
        fetch(`${API_BASE}/hospital/expenditures`, { headers: authHeaders }),
      ]);
      if (!statusRes.ok) throw new Error(await getError(statusRes, 'Unable to load hospital status'));
      if (!suppliesRes.ok) throw new Error(await getError(suppliesRes, 'Unable to load medical supply requests'));
      if (!expenditureRes.ok) throw new Error(await getError(expenditureRes, 'Unable to load expenditure reports'));

      const statusData = await statusRes.json();
      setStatus(statusData);
      setPatientForm({
        current_patients: statusData.current_patients,
        critical_patients: statusData.critical_patients,
        new_emergency_patients: statusData.new_emergency_patients,
      });
      setCapacityForm({
        total_beds: statusData.total_beds,
        occupied_beds: statusData.occupied_beds,
        emergency_beds: statusData.emergency_beds,
        staff_on_duty: statusData.staff_on_duty,
        ambulances_available: statusData.ambulances_available,
        emergency_capacity_status: statusData.emergency_capacity_status,
      });
      setSupplies(await suppliesRes.json());
      setExpenditures(await expenditureRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitJson = async (url, method, body, successText) => {
    setError('');
    setMessage('');
    const res = await fetch(url, {
      method,
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await getError(res, 'Request failed'));
    setMessage(successText);
    return res.json();
  };

  const handlePatientUpdate = async (e) => {
    e.preventDefault();
    try {
      const data = await submitJson(`${API_BASE}/hospital/patient-statistics`, 'PATCH', {
        current_patients: Number(patientForm.current_patients),
        critical_patients: Number(patientForm.critical_patients),
        new_emergency_patients: Number(patientForm.new_emergency_patients),
      }, 'Patient statistics updated successfully.');
      setStatus(data);
    } catch (err) { setError(err.message); }
  };

  const handleCapacityUpdate = async (e) => {
    e.preventDefault();
    try {
      const data = await submitJson(`${API_BASE}/hospital/capacity`, 'PATCH', {
        ...capacityForm,
        total_beds: Number(capacityForm.total_beds),
        occupied_beds: Number(capacityForm.occupied_beds),
        emergency_beds: Number(capacityForm.emergency_beds),
        staff_on_duty: Number(capacityForm.staff_on_duty),
        ambulances_available: Number(capacityForm.ambulances_available),
      }, 'Emergency capacity report updated.');
      setStatus(data);
    } catch (err) { setError(err.message); }
  };

  const handleResourceRequest = async (e) => {
    e.preventDefault();
    try {
      await submitJson(`${API_BASE}/hospital/requests`, 'POST', {
        ...requestForm,
        quantity: Number(requestForm.quantity),
      }, 'Emergency medical resource request submitted.');
      setRequestForm(emptyRequest);
      await loadDashboard();
    } catch (err) { setError(err.message); }
  };

  const handleExpenditure = async (e) => {
    e.preventDefault();
    try {
      await submitJson(`${API_BASE}/hospital/expenditures`, 'POST', {
        ...expenditureForm,
        amount: Number(expenditureForm.amount),
        report_period: expenditureForm.report_period || null,
      }, 'Expenditure report submitted.');
      setExpenditureForm(emptyExpenditure);
      await loadDashboard();
    } catch (err) { setError(err.message); }
  };

  const input = (key, form, setForm, type = 'number') => (
    <input
      className="input-control"
      type={type}
      min={type === 'number' ? 0 : undefined}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      required
    />
  );

  const availableBeds = Math.max(0, (status?.total_beds || 0) - (status?.occupied_beds || 0));
  const pendingSupplies = supplies.filter((item) => ['Pending', 'Approved', 'In-Transit'].includes(item.status)).length;

  return (
    <div className="theme-hospital" style={{ padding: '28px', minHeight: 'calc(100vh - 72px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px', flexWrap: 'wrap' }}>
          <div>
            <div className="badge badge-hospital" style={{ marginBottom: '10px' }}><Building size={13} /> Hospital Portal</div>
            <h1 style={{ color: 'white', fontSize: '2rem' }}>{user.organization_name || user.full_name}</h1>
            <p style={{ color: '#9ca3af', marginTop: '6px' }}>Emergency medical services, patient capacity and incoming supply coordination.</p>
          </div>
          <button className="btn btn-secondary" onClick={loadDashboard}><RefreshCw size={16} /> Refresh</button>
        </div>

        {error && <div className="feature-error"><AlertTriangle size={17} /> {error}</div>}
        {message && <div className="feature-success">✓ {message}</div>}

        <div className="feature-stat-grid">
          <div className="glass-card feature-stat"><Activity size={22} color="#22d3ee" /><div><strong>{status?.current_patients ?? 0}</strong><span>Current Patients</span></div></div>
          <div className="glass-card feature-stat"><BarChart2 size={22} color="#fb7185" /><div><strong>{status?.critical_patients ?? 0}</strong><span>Critical Patients</span></div></div>
          <div className="glass-card feature-stat"><Building size={22} color="#34d399" /><div><strong>{availableBeds}</strong><span>Available Beds</span></div></div>
          <div className="glass-card feature-stat"><Truck size={22} color="#fbbf24" /><div><strong>{pendingSupplies}</strong><span>Incoming / Pending Supplies</span></div></div>
        </div>

        {loading ? (
          <div className="glass-card" style={{ textAlign: 'center', color: '#9ca3af' }}>Loading hospital operations...</div>
        ) : (
          <>
            <div className="feature-two-column">
              <form className="glass-card" onSubmit={handlePatientUpdate}>
                <h2 className="feature-card-title"><Activity size={20} color="#22d3ee" /> Update Patient Statistics</h2>
                <div className="feature-form-grid">
                  <div className="form-group"><label>Current Patients</label>{input('current_patients', patientForm, setPatientForm)}</div>
                  <div className="form-group"><label>Critical Patients</label>{input('critical_patients', patientForm, setPatientForm)}</div>
                  <div className="form-group"><label>New Emergency Patients</label>{input('new_emergency_patients', patientForm, setPatientForm)}</div>
                </div>
                <button className="btn btn-primary" type="submit">Update Patient Statistics</button>
              </form>

              <form className="glass-card" onSubmit={handleCapacityUpdate}>
                <h2 className="feature-card-title"><BarChart2 size={20} color="#34d399" /> Report Emergency Capacity</h2>
                <div className="feature-form-grid">
                  <div className="form-group"><label>Total Beds</label>{input('total_beds', capacityForm, setCapacityForm)}</div>
                  <div className="form-group"><label>Occupied Beds</label>{input('occupied_beds', capacityForm, setCapacityForm)}</div>
                  <div className="form-group"><label>Emergency Beds</label>{input('emergency_beds', capacityForm, setCapacityForm)}</div>
                  <div className="form-group"><label>Staff on Duty</label>{input('staff_on_duty', capacityForm, setCapacityForm)}</div>
                  <div className="form-group"><label>Ambulances Available</label>{input('ambulances_available', capacityForm, setCapacityForm)}</div>
                  <div className="form-group"><label>Capacity Status</label><select className="input-control" value={capacityForm.emergency_capacity_status} onChange={(e) => setCapacityForm({ ...capacityForm, emergency_capacity_status: e.target.value })}><option>Available</option><option>Limited</option><option>Critical</option><option>Full</option></select></div>
                </div>
                <button className="btn btn-success" type="submit">Update Capacity Report</button>
              </form>
            </div>

            <div className="feature-two-column">
              <form className="glass-card" onSubmit={handleResourceRequest}>
                <h2 className="feature-card-title"><PlusCircle size={20} color="#60a5fa" /> Request Emergency Medicine / Equipment</h2>
                <div className="form-group"><label>Resource Type</label><select className="input-control" value={requestForm.item_category} onChange={(e) => setRequestForm({ ...requestForm, item_category: e.target.value })}><option>Medicine</option><option>Medical Equipment</option></select></div>
                <div className="form-group"><label>Item Name</label><input className="input-control" required placeholder="e.g. IV Saline, Oxygen Cylinder, Trauma Kit" value={requestForm.item_name} onChange={(e) => setRequestForm({ ...requestForm, item_name: e.target.value })} /></div>
                <div className="feature-form-grid">
                  <div className="form-group"><label>Quantity</label><input className="input-control" type="number" min="0.01" step="0.01" required value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })} /></div>
                  <div className="form-group"><label>Unit</label><input className="input-control" required value={requestForm.unit} onChange={(e) => setRequestForm({ ...requestForm, unit: e.target.value })} /></div>
                  <div className="form-group"><label>Priority</label><select className="input-control" value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
                </div>
                <div className="form-group"><label>Hospital Delivery Address</label><input className="input-control" required value={requestForm.destination_address} onChange={(e) => setRequestForm({ ...requestForm, destination_address: e.target.value })} /></div>
                <button className="btn btn-primary" type="submit"><Package size={16} /> Submit Medical Request</button>
              </form>

              <form className="glass-card" onSubmit={handleExpenditure}>
                <h2 className="feature-card-title"><CreditCard size={20} color="#fbbf24" /> Submit Expenditure Report</h2>
                <div className="form-group"><label>Expense Category</label><input className="input-control" required value={expenditureForm.category} onChange={(e) => setExpenditureForm({ ...expenditureForm, category: e.target.value })} /></div>
                <div className="feature-form-grid">
                  <div className="form-group"><label>Amount (BDT)</label><input className="input-control" type="number" min="0.01" step="0.01" required value={expenditureForm.amount} onChange={(e) => setExpenditureForm({ ...expenditureForm, amount: e.target.value })} /></div>
                  <div className="form-group"><label>Report Period</label><input className="input-control" placeholder="e.g. Aug 2026" value={expenditureForm.report_period} onChange={(e) => setExpenditureForm({ ...expenditureForm, report_period: e.target.value })} /></div>
                </div>
                <div className="form-group"><label>Description</label><textarea className="input-control" rows="4" required value={expenditureForm.description} onChange={(e) => setExpenditureForm({ ...expenditureForm, description: e.target.value })} /></div>
                <button className="btn btn-secondary" type="submit"><CreditCard size={16} /> Submit Expenditure</button>
              </form>
            </div>

            <div className="glass-card" style={{ marginBottom: '20px' }}>
              <h2 className="feature-card-title"><Truck size={20} color="#22d3ee" /> Track Incoming Medical Supplies</h2>
              <div className="data-table-container">
                <table className="data-table"><thead><tr><th>Item</th><th>Type</th><th>Quantity</th><th>Priority</th><th>Status</th><th>ETA</th></tr></thead><tbody>
                  {supplies.length === 0 ? <tr><td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af' }}>No medical supply requests submitted yet.</td></tr> : supplies.map((item) => <tr key={item.id}><td>{item.item_name}</td><td>{item.item_category}</td><td>{item.quantity} {item.unit}</td><td>{item.priority}</td><td><span className={item.status === 'Delivered' ? 'badge badge-org' : item.status === 'In-Transit' ? 'badge badge-govt' : 'badge badge-warning'}>{item.status}</span></td><td>{item.estimated_arrival_minutes ? `${item.estimated_arrival_minutes} min` : 'Awaiting dispatch'}</td></tr>)}
                </tbody></table>
              </div>
            </div>

            <div className="glass-card">
              <h2 className="feature-card-title"><CreditCard size={20} color="#fbbf24" /> Expenditure History</h2>
              <div className="data-table-container"><table className="data-table"><thead><tr><th>Category</th><th>Amount</th><th>Period</th><th>Description</th><th>Submitted</th></tr></thead><tbody>
                {expenditures.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af' }}>No expenditure reports submitted yet.</td></tr> : expenditures.map((item) => <tr key={item.id}><td>{item.category}</td><td>৳{Number(item.amount).toLocaleString()}</td><td>{item.report_period || '—'}</td><td>{item.description}</td><td>{new Date(item.created_at).toLocaleString()}</td></tr>)}
              </tbody></table></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
