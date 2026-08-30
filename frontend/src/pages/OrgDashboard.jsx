import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Warehouse, AlertTriangle, PlusCircle, Navigation, Truck, Package, Layers, RefreshCw } from 'lucide-react';
import { calculateGoogleDistanceMatrix, hasGoogleMapsApiKey } from '../services/googleMaps';
import { OrganizationOperations } from './OrganizationOperations';

export const OrgDashboard = () => {
  const { token, API_BASE, user } = useAuth();
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItem, setNewItem] = useState({
    item_name: '',
    category: 'Food',
    quantity: 1000,
    unit: 'boxes',
    minimum_threshold: 200,
    warehouse_location: 'Sylhet Central Warehouse',
    warehouse_lat: 24.8949,
    warehouse_lng: 91.8687,
  });

  useEffect(() => {
    fetchOrgData();
  }, [token]);

  const fetchOrgData = async () => {
    try {
      setLoading(true);
      const [iRes, rRes, lRes] = await Promise.all([
        fetch(`${API_BASE}/inventory/items`),
        fetch(`${API_BASE}/inventory/requests`),
        fetch(`${API_BASE}/inventory/low-stock-alerts`),
      ]);
      const iData = await iRes.json();
      const rData = await rRes.json();
      const lData = await lRes.json();

      setItems(iData);
      setRequests(rData);
      setLowStockItems(lData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/inventory/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newItem),
      });
      if (!res.ok) throw new Error('Failed to add inventory item');
      alert('Warehouse inventory item added successfully.');
      setShowAddItemModal(false);
      fetchOrgData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOptimizeDispatch = async (requestId) => {
    try {
      const request = requests.find((item) => item.id === requestId);
      if (!request) throw new Error('Resource request not found');

      const currentOrg = user?.organization_name || user?.full_name;
      let candidateWarehouses = items.filter((item) =>
        item.organization_name === currentOrg &&
        item.category === request.item_category &&
        Number(item.quantity) >= Number(request.quantity)
      );

      // Keep the previous backend behaviour: if no warehouse has enough stock,
      // allow the organization's same-category warehouse as a fallback candidate.
      if (!candidateWarehouses.length) {
        candidateWarehouses = items.filter((item) =>
          item.organization_name === currentOrg && item.category === request.item_category
        );
      }

      let googleOptimization = null;
      let routeProvider = 'DisasterNet fallback route';

      if (hasGoogleMapsApiKey() && candidateWarehouses.length) {
        try {
          const bestRoute = await calculateGoogleDistanceMatrix(candidateWarehouses, {
            lat: request.destination_lat,
            lng: request.destination_lng,
          });
          googleOptimization = {
            warehouse_id: bestRoute.warehouse.id,
            distance_meters: bestRoute.distance_meters,
            duration_seconds: bestRoute.duration_seconds,
            provider: bestRoute.provider,
          };
          routeProvider = `${bestRoute.provider} (${bestRoute.distance_text}, ${bestRoute.duration_text})`;
        } catch (googleError) {
          console.warn('Google Distance Matrix unavailable; using existing fallback optimizer:', googleError);
        }
      }

      const res = await fetch(`${API_BASE}/inventory/requests/${requestId}/optimize-dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: googleOptimization ? JSON.stringify(googleOptimization) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Dispatch failed');
      alert(`[ROUTE OPTIMIZATION DISPATCHED]\nProvider: ${routeProvider}\nAssigned Warehouse: ${data.assigned_warehouse}\nVehicle: ${data.assigned_vehicle}\nShortest Route: ${data.estimated_distance_km} km\nEstimated Arrival Time: ${data.estimated_arrival_minutes} mins`);
      await fetchOrgData();
      window.dispatchEvent(new Event('disasternet:shared-data-changed'));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateStock = async (itemId, newQty) => {
    const qtyNum = parseFloat(newQty);
    if (isNaN(qtyNum)) return;
    try {
      const res = await fetch(`${API_BASE}/inventory/items/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quantity: qtyNum }),
      });
      if (!res.ok) throw new Error('Failed to update stock');
      fetchOrgData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="theme-organization" style={{ padding: '28px' }}>
      {/* Top Banner */}
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge badge-org" style={{ marginBottom: '8px' }}>
              <Warehouse size={14} /> Resource & Logistics Coordination
            </span>
            <h1 style={{ color: 'white', fontSize: '1.8rem' }}>
              {user?.organization_name || user?.full_name} Logistics Hub
            </h1>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>
              Manage warehouse emergency supplies (Food, Water, Medicine, Blankets, Generators) & dispatch relief convoys.
            </p>
          </div>
          <button className="btn btn-success" onClick={() => setShowAddItemModal(true)}>
            <PlusCircle size={16} /> Add Warehouse Item
          </button>
        </div>
      </div>

      {/* Module 2 Feature 4: Low Stock Alert Cards Banner */}
      {lowStockItems.length > 0 && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '14px', padding: '16px 20px', marginBottom: '24px' }}>
          <h3 style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
            <AlertTriangle size={18} /> Low Inventory Stock Threshold Breached ({lowStockItems.length} Items)
          </h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
            {lowStockItems.map((item) => (
              <div key={item.id} style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid #ef4444', borderRadius: '10px', padding: '10px 14px', fontSize: '0.85rem' }}>
                <strong style={{ color: 'white' }}>{item.item_name}</strong>: <span style={{ color: '#f87171', fontWeight: 800 }}>{item.quantity} {item.unit}</span> (Min: {item.minimum_threshold})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Dual Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        {/* Module 2 Feature 1: Inventory Table */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package color="#10b981" /> Warehouse Resource Inventory
            </h2>
            <button className="btn btn-secondary" onClick={fetchOrgData} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
              <RefreshCw size={12} /> Sync
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Warehouse</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'white' }}>{item.item_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{item.organization_name}</div>
                    </td>
                    <td>
                      <span className="badge badge-org">{item.category}</span>
                    </td>
                    <td>
                      {item.organization_name === (user?.organization_name || user?.full_name) ? (
                        <input
                          type="number"
                          min="0"
                          className="input-control"
                          style={{ width: '90px', padding: '4px 8px', fontSize: '0.85rem' }}
                          value={item.quantity}
                          onChange={(e) => handleUpdateStock(item.id, e.target.value)}
                        />
                      ) : (
                        <span style={{ color: 'white', fontWeight: 700 }}>{item.quantity}</span>
                      )}{' '}
                      <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{item.unit}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{item.warehouse_location}</td>
                    <td>
                      {item.is_low_stock ? (
                        <span className="badge badge-critical">Low Stock</span>
                      ) : (
                        <span className="badge badge-org">Adequate</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Module 2 Feature 2 & 3: Emergency Requests & Intelligent Route Optimization */}
        <div className="glass-card">
          <h2 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation color="#34d399" /> Emergency Resource Requests & Intelligent Dispatch
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {requests.map((req) => (
              <div key={req.id} style={{ background: 'rgba(31, 41, 55, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className={`badge ${req.priority === 'Critical' ? 'badge-critical' : 'badge-warning'}`}>
                    {req.priority} Priority
                  </span>
                  <span className={`badge ${req.status === 'In-Transit' ? 'badge-warning' : req.status === 'Delivered' ? 'badge-org' : 'badge-user'}`}>
                    {req.status}
                  </span>
                </div>

                <h4 style={{ color: 'white', fontSize: '1rem' }}>
                  {req.quantity} {req.unit} of {req.item_name} ({req.item_category})
                </h4>
                <div style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: '4px' }}>
                  Requester: <strong style={{ color: 'white' }}>{req.requester_name}</strong> ({req.requester_role})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#60a5fa', marginTop: '2px' }}>
                  Destination: {req.destination_address}
                </div>

                {req.status === 'In-Transit' && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '8px 12px', marginTop: '10px', fontSize: '0.8rem', color: '#fbbf24' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Truck size={14} /> <strong>Vehicle:</strong> {req.assigned_vehicle}
                    </div>
                    <div>Distance: {req.estimated_distance_km} km | ETA: {req.estimated_arrival_minutes} mins</div>
                  </div>
                )}

                {req.status === 'Pending' && (
                  <button
                    onClick={() => handleOptimizeDispatch(req.id)}
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '12px', fontSize: '0.85rem' }}
                  >
                    <Navigation size={14} /> Run Route Optimization & Dispatch
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <OrganizationOperations />

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="modal-overlay" onClick={() => setShowAddItemModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', marginBottom: '16px' }}>Add Warehouse Inventory Item</h2>
            <form onSubmit={handleAddItem}>
              <div className="form-group">
                <label>Item Name</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. Water Purification Tablets"
                  value={newItem.item_name}
                  onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    className="input-control"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  >
                    <option value="Food">Food</option>
                    <option value="Water">Water</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Blankets">Blankets</option>
                    <option value="Generators">Generators</option>
                    <option value="Shelter Gear">Shelter Gear</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Unit Type</label>
                  <input
                    type="text"
                    className="input-control"
                    required
                    placeholder="e.g. boxes, liters, units"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Initial Quantity</label>
                  <input
                    type="number"
                    className="input-control"
                    required
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label>Low Stock Threshold Alert</label>
                  <input
                    type="number"
                    className="input-control"
                    required
                    value={newItem.minimum_threshold}
                    onChange={(e) => setNewItem({ ...newItem, minimum_threshold: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Warehouse Location</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder="e.g. Sylhet Central Warehouse"
                  value={newItem.warehouse_location}
                  onChange={(e) => setNewItem({ ...newItem, warehouse_location: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-success" style={{ flex: 1 }}>
                  Save Item
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddItemModal(false)}>
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
