import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Home, Package, PlusCircle, RefreshCw, Truck, Users } from 'lucide-react';

const emptyResource = { item_name: '', category: 'Food', quantity: 0, unit: 'units', minimum_threshold: 0 };
const emptyRequest = { item_category: 'Food', item_name: '', quantity: 1, unit: 'units', priority: 'High', destination_address: '' };
const emptyShortage = { item_name: '', required_quantity: 1, available_quantity: 0, unit: 'units', severity: 'High', notes: '' };
const emptyDistribution = { resource_id: '', quantity: 1, recipient_group: 'Shelter Residents', notes: '' };

export const ShelterDashboard = () => {
  const { user, token, API_BASE } = useAuth();
  const [status, setStatus] = useState(null);
  const [resources, setResources] = useState([]);
  const [requests, setRequests] = useState([]);
  const [shortages, setShortages] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [capacity, setCapacity] = useState(0);
  const [occupancy, setOccupancy] = useState({ current_occupancy: 0, occupancy_status: '' });
  const [resourceForm, setResourceForm] = useState(emptyResource);
  const [requestForm, setRequestForm] = useState(emptyRequest);
  const [shortageForm, setShortageForm] = useState(emptyShortage);
  const [distributionForm, setDistributionForm] = useState(emptyDistribution);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const getError = async (res, fallback) => {
    try {
      const data = await res.json();
      if (Array.isArray(data.detail)) return data.detail.map((item) => item.msg).join(', ');
      return data.detail || fallback;
    } catch { return fallback; }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const responses = await Promise.all([
        fetch(`${API_BASE}/shelter/status`, { headers: authHeaders }),
        fetch(`${API_BASE}/shelter/resources`, { headers: authHeaders }),
        fetch(`${API_BASE}/shelter/requests`, { headers: authHeaders }),
        fetch(`${API_BASE}/shelter/shortages`, { headers: authHeaders }),
        fetch(`${API_BASE}/shelter/distributions`, { headers: authHeaders }),
      ]);
      for (const res of responses) if (!res.ok) throw new Error(await getError(res, 'Unable to load shelter dashboard'));
      const [statusData, resourceData, requestData, shortageData, distributionData] = await Promise.all(responses.map((res) => res.json()));
      setStatus(statusData);
      setCapacity(statusData.total_capacity);
      setOccupancy({ current_occupancy: statusData.current_occupancy, occupancy_status: statusData.occupancy_status });
      setResources(resourceData);
      setRequests(requestData);
      setShortages(shortageData);
      setDistributions(distributionData);
      if (!distributionForm.resource_id && resourceData[0]) setDistributionForm((prev) => ({ ...prev, resource_id: String(resourceData[0].id) }));
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
    setError(''); setMessage('');
    const res = await fetch(url, { method, headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await getError(res, 'Request failed'));
    setMessage(successText);
    return res.json();
  };

  const updateCapacity = async (e) => {
    e.preventDefault();
    try { await submitJson(`${API_BASE}/shelter/capacity`, 'PATCH', { total_capacity: Number(capacity) }, 'Shelter capacity updated.'); await loadDashboard(); } catch (err) { setError(err.message); }
  };

  const updateOccupancy = async (e) => {
    e.preventDefault();
    try { await submitJson(`${API_BASE}/shelter/occupancy`, 'PATCH', { current_occupancy: Number(occupancy.current_occupancy), occupancy_status: occupancy.occupancy_status || null }, 'Occupancy status updated.'); await loadDashboard(); } catch (err) { setError(err.message); }
  };

  const addResource = async (e) => {
    e.preventDefault();
    try { await submitJson(`${API_BASE}/shelter/resources`, 'POST', { ...resourceForm, quantity: Number(resourceForm.quantity), minimum_threshold: Number(resourceForm.minimum_threshold) }, 'Shelter resource added.'); setResourceForm(emptyResource); await loadDashboard(); } catch (err) { setError(err.message); }
  };

  const requestSupplies = async (e) => {
    e.preventDefault();
    try { await submitJson(`${API_BASE}/shelter/requests`, 'POST', { ...requestForm, quantity: Number(requestForm.quantity) }, 'Emergency supply request submitted.'); setRequestForm(emptyRequest); await loadDashboard(); } catch (err) { setError(err.message); }
  };

  const reportShortage = async (e) => {
    e.preventDefault();
    try { await submitJson(`${API_BASE}/shelter/shortages`, 'POST', { ...shortageForm, required_quantity: Number(shortageForm.required_quantity), available_quantity: Number(shortageForm.available_quantity) }, 'Shortage report submitted.'); setShortageForm(emptyShortage); await loadDashboard(); } catch (err) { setError(err.message); }
  };

  const recordDistribution = async (e) => {
    e.preventDefault();
    if (!distributionForm.resource_id) { setError('Add a shelter resource before recording a distribution.'); return; }
    try { await submitJson(`${API_BASE}/shelter/distributions`, 'POST', { resource_id: Number(distributionForm.resource_id), quantity: Number(distributionForm.quantity), recipient_group: distributionForm.recipient_group, notes: distributionForm.notes || null }, 'Distributed resource recorded and stock updated.'); setDistributionForm({ ...emptyDistribution, resource_id: distributionForm.resource_id }); await loadDashboard(); } catch (err) { setError(err.message); }
  };

  const updateResourceQuantity = async (resource) => {
    const entered = window.prompt(`New quantity for ${resource.item_name} (${resource.unit})`, String(resource.quantity));
    if (entered === null) return;
    const quantity = Number(entered);
    if (!Number.isFinite(quantity) || quantity < 0) { setError('Quantity must be zero or greater.'); return; }
    try { await submitJson(`${API_BASE}/shelter/resources/${resource.id}`, 'PATCH', { quantity }, 'Shelter resource quantity updated.'); await loadDashboard(); } catch (err) { setError(err.message); }
  };

  const availableSpaces = Math.max(0, (status?.total_capacity || 0) - (status?.current_occupancy || 0));
  const lowStockCount = resources.filter((item) => item.is_low_stock).length;

  return (
    <div className="theme-shelter" style={{ padding: '28px', minHeight: 'calc(100vh - 72px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px', flexWrap: 'wrap' }}>
          <div>
            <div className="badge badge-shelter" style={{ marginBottom: '10px' }}><Home size={13} /> Disaster Shelter Portal</div>
            <h1 style={{ color: 'white', fontSize: '2rem' }}>{user.organization_name || user.full_name}</h1>
            <p style={{ color: '#9ca3af', marginTop: '6px' }}>Capacity, occupancy, emergency supplies and distributed-resource management.</p>
          </div>
          <button className="btn btn-secondary" onClick={loadDashboard}><RefreshCw size={16} /> Refresh</button>
        </div>

        {error && <div className="feature-error"><AlertTriangle size={17} /> {error}</div>}
        {message && <div className="feature-success">✓ {message}</div>}

        <div className="feature-stat-grid">
          <div className="glass-card feature-stat"><Users size={22} color="#fb923c" /><div><strong>{status?.current_occupancy ?? 0}</strong><span>Current Occupancy</span></div></div>
          <div className="glass-card feature-stat"><Home size={22} color="#34d399" /><div><strong>{availableSpaces}</strong><span>Available Spaces</span></div></div>
          <div className="glass-card feature-stat"><Package size={22} color="#60a5fa" /><div><strong>{resources.length}</strong><span>Resource Types</span></div></div>
          <div className="glass-card feature-stat"><AlertTriangle size={22} color="#f87171" /><div><strong>{lowStockCount}</strong><span>Low Stock Items</span></div></div>
        </div>

        {loading ? <div className="glass-card" style={{ textAlign: 'center', color: '#9ca3af' }}>Loading shelter operations...</div> : <>
          <div className="feature-two-column">
            <form className="glass-card" onSubmit={updateCapacity}>
              <h2 className="feature-card-title"><Home size={20} color="#fb923c" /> Update Shelter Capacity</h2>
              <div className="form-group"><label>Total Shelter Capacity</label><input className="input-control" type="number" min="0" required value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
              <div style={{ color: '#9ca3af', marginBottom: '16px', fontSize: '0.88rem' }}>Available spaces are calculated automatically from capacity and occupancy.</div>
              <button className="btn btn-primary" type="submit">Save Capacity</button>
            </form>

            <form className="glass-card" onSubmit={updateOccupancy}>
              <h2 className="feature-card-title"><Users size={20} color="#34d399" /> Update Occupancy Status</h2>
              <div className="feature-form-grid">
                <div className="form-group"><label>Current Occupancy</label><input className="input-control" type="number" min="0" required value={occupancy.current_occupancy} onChange={(e) => setOccupancy({ ...occupancy, current_occupancy: e.target.value })} /></div>
                <div className="form-group"><label>Status</label><select className="input-control" value={occupancy.occupancy_status} onChange={(e) => setOccupancy({ ...occupancy, occupancy_status: e.target.value })}><option value="">Auto Calculate</option><option>Available</option><option>Limited</option><option>Full</option><option>Over Capacity</option><option>Closed</option></select></div>
              </div>
              <button className="btn btn-success" type="submit">Update Occupancy</button>
            </form>
          </div>

          <div className="feature-two-column">
            <form className="glass-card" onSubmit={addResource}>
              <h2 className="feature-card-title"><Package size={20} color="#60a5fa" /> Manage Available Resources</h2>
              <div className="form-group"><label>Item Name</label><input className="input-control" required value={resourceForm.item_name} onChange={(e) => setResourceForm({ ...resourceForm, item_name: e.target.value })} /></div>
              <div className="feature-form-grid">
                <div className="form-group"><label>Category</label><select className="input-control" value={resourceForm.category} onChange={(e) => setResourceForm({ ...resourceForm, category: e.target.value })}><option>Food</option><option>Water</option><option>Medicine</option><option>Blankets</option><option>Hygiene</option><option>Sanitation</option><option>Shelter Gear</option><option>Other</option></select></div>
                <div className="form-group"><label>Unit</label><input className="input-control" required value={resourceForm.unit} onChange={(e) => setResourceForm({ ...resourceForm, unit: e.target.value })} /></div>
                <div className="form-group"><label>Quantity</label><input className="input-control" type="number" min="0" step="0.01" required value={resourceForm.quantity} onChange={(e) => setResourceForm({ ...resourceForm, quantity: e.target.value })} /></div>
                <div className="form-group"><label>Low Stock Threshold</label><input className="input-control" type="number" min="0" step="0.01" required value={resourceForm.minimum_threshold} onChange={(e) => setResourceForm({ ...resourceForm, minimum_threshold: e.target.value })} /></div>
              </div>
              <button className="btn btn-primary" type="submit"><PlusCircle size={16} /> Add Resource</button>
            </form>

            <form className="glass-card" onSubmit={requestSupplies}>
              <h2 className="feature-card-title"><Truck size={20} color="#fbbf24" /> Request Emergency Supplies</h2>
              <div className="feature-form-grid">
                <div className="form-group"><label>Category</label><select className="input-control" value={requestForm.item_category} onChange={(e) => setRequestForm({ ...requestForm, item_category: e.target.value })}><option>Food</option><option>Water</option><option>Medicine</option><option>Blankets</option><option>Generators</option><option>Shelter Gear</option><option>Hygiene</option><option>Sanitation</option><option>Other</option></select></div>
                <div className="form-group"><label>Priority</label><select className="input-control" value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
              </div>
              <div className="form-group"><label>Item Name</label><input className="input-control" required value={requestForm.item_name} onChange={(e) => setRequestForm({ ...requestForm, item_name: e.target.value })} /></div>
              <div className="feature-form-grid"><div className="form-group"><label>Quantity</label><input className="input-control" type="number" min="0.01" step="0.01" required value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })} /></div><div className="form-group"><label>Unit</label><input className="input-control" required value={requestForm.unit} onChange={(e) => setRequestForm({ ...requestForm, unit: e.target.value })} /></div></div>
              <div className="form-group"><label>Shelter Delivery Address</label><input className="input-control" required value={requestForm.destination_address} onChange={(e) => setRequestForm({ ...requestForm, destination_address: e.target.value })} /></div>
              <button className="btn btn-primary" type="submit">Submit Supply Request</button>
            </form>
          </div>

          <div className="feature-two-column">
            <form className="glass-card" onSubmit={reportShortage}>
              <h2 className="feature-card-title"><AlertTriangle size={20} color="#f87171" /> Report Shortages</h2>
              <div className="form-group"><label>Shortage Item</label><input className="input-control" required value={shortageForm.item_name} onChange={(e) => setShortageForm({ ...shortageForm, item_name: e.target.value })} /></div>
              <div className="feature-form-grid"><div className="form-group"><label>Required</label><input className="input-control" type="number" min="0.01" step="0.01" required value={shortageForm.required_quantity} onChange={(e) => setShortageForm({ ...shortageForm, required_quantity: e.target.value })} /></div><div className="form-group"><label>Available</label><input className="input-control" type="number" min="0" step="0.01" required value={shortageForm.available_quantity} onChange={(e) => setShortageForm({ ...shortageForm, available_quantity: e.target.value })} /></div><div className="form-group"><label>Unit</label><input className="input-control" required value={shortageForm.unit} onChange={(e) => setShortageForm({ ...shortageForm, unit: e.target.value })} /></div><div className="form-group"><label>Severity</label><select className="input-control" value={shortageForm.severity} onChange={(e) => setShortageForm({ ...shortageForm, severity: e.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div></div>
              <div className="form-group"><label>Notes</label><textarea className="input-control" rows="3" value={shortageForm.notes} onChange={(e) => setShortageForm({ ...shortageForm, notes: e.target.value })} /></div>
              <button className="btn btn-danger" type="submit">Report Shortage</button>
            </form>

            <form className="glass-card" onSubmit={recordDistribution}>
              <h2 className="feature-card-title"><Users size={20} color="#c084fc" /> Record Distributed Resources</h2>
              <div className="form-group"><label>Resource</label><select className="input-control" required value={distributionForm.resource_id} onChange={(e) => setDistributionForm({ ...distributionForm, resource_id: e.target.value })}><option value="">Select resource</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.item_name} — {resource.quantity} {resource.unit}</option>)}</select></div>
              <div className="feature-form-grid"><div className="form-group"><label>Quantity Distributed</label><input className="input-control" type="number" min="0.01" step="0.01" required value={distributionForm.quantity} onChange={(e) => setDistributionForm({ ...distributionForm, quantity: e.target.value })} /></div><div className="form-group"><label>Recipient Group</label><input className="input-control" required value={distributionForm.recipient_group} onChange={(e) => setDistributionForm({ ...distributionForm, recipient_group: e.target.value })} /></div></div>
              <div className="form-group"><label>Notes</label><textarea className="input-control" rows="3" value={distributionForm.notes} onChange={(e) => setDistributionForm({ ...distributionForm, notes: e.target.value })} /></div>
              <button className="btn btn-secondary" type="submit">Record Distribution</button>
            </form>
          </div>

          <div className="glass-card" style={{ marginBottom: '20px' }}>
            <h2 className="feature-card-title"><Package size={20} color="#60a5fa" /> Shelter Resource Inventory</h2>
            <div className="data-table-container"><table className="data-table"><thead><tr><th>Item</th><th>Category</th><th>Available</th><th>Threshold</th><th>Status</th><th>Action</th></tr></thead><tbody>
              {resources.length === 0 ? <tr><td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af' }}>No shelter resources recorded yet.</td></tr> : resources.map((resource) => <tr key={resource.id}><td>{resource.item_name}</td><td>{resource.category}</td><td>{resource.quantity} {resource.unit}</td><td>{resource.minimum_threshold} {resource.unit}</td><td>{resource.is_low_stock ? <span className="badge badge-critical">Low Stock</span> : <span className="badge badge-org">Available</span>}</td><td><button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.78rem' }} onClick={() => updateResourceQuantity(resource)}>Update Qty</button></td></tr>)}
            </tbody></table></div>
          </div>

          <div className="feature-two-column">
            <div className="glass-card"><h2 className="feature-card-title"><Truck size={20} color="#fbbf24" /> Supply Request Tracking</h2><div className="data-table-container"><table className="data-table"><thead><tr><th>Item</th><th>Qty</th><th>Status</th></tr></thead><tbody>{requests.length === 0 ? <tr><td colSpan="3" style={{ textAlign: 'center', color: '#9ca3af' }}>No supply requests yet.</td></tr> : requests.map((item) => <tr key={item.id}><td>{item.item_name}</td><td>{item.quantity} {item.unit}</td><td>{item.status}</td></tr>)}</tbody></table></div></div>
            <div className="glass-card"><h2 className="feature-card-title"><AlertTriangle size={20} color="#f87171" /> Shortage Reports</h2><div className="data-table-container"><table className="data-table"><thead><tr><th>Item</th><th>Gap</th><th>Severity</th></tr></thead><tbody>{shortages.length === 0 ? <tr><td colSpan="3" style={{ textAlign: 'center', color: '#9ca3af' }}>No shortages reported.</td></tr> : shortages.map((item) => <tr key={item.id}><td>{item.item_name}</td><td>{Math.max(0, item.required_quantity - item.available_quantity)} {item.unit}</td><td>{item.severity}</td></tr>)}</tbody></table></div></div>
          </div>

          <div className="glass-card"><h2 className="feature-card-title"><Users size={20} color="#c084fc" /> Distribution History</h2><div className="data-table-container"><table className="data-table"><thead><tr><th>Item</th><th>Quantity</th><th>Recipients</th><th>Recorded</th></tr></thead><tbody>{distributions.length === 0 ? <tr><td colSpan="4" style={{ textAlign: 'center', color: '#9ca3af' }}>No distributed resources recorded yet.</td></tr> : distributions.map((item) => <tr key={item.id}><td>{item.item_name}</td><td>{item.quantity} {item.unit}</td><td>{item.recipient_group}</td><td>{new Date(item.distributed_at).toLocaleString()}</td></tr>)}</tbody></table></div></div>
        </>}
      </div>
    </div>
  );
};
