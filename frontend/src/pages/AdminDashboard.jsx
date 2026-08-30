import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Award, Database, Trash2, UserPlus, Key, ShieldCheck, Activity, BarChart2 } from 'lucide-react';

export const AdminDashboard = () => {
  const { token, API_BASE } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state for creating a new user directly in DB
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'donor',
    organization_name: '',
    phone: '',
  });

  useEffect(() => {
    fetchAdminData();
  }, [token]);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [usersRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/admin/database-stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (!usersRes.ok) throw new Error('Failed to fetch user database');
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();

      setUsers(usersData);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (window.confirm(`[ADMIN PRIVILEGE] Are you sure you want to delete user account "${userEmail}" from the database?`)) {
      try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Delete failed');
        alert(`Account ${userEmail} deleted successfully.`);
        fetchAdminData();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'User creation failed');
      alert(`User ${newUser.email} added to database.`);
      setShowAddModal(false);
      setNewUser({ email: '', password: '', full_name: '', role: 'donor', organization_name: '', phone: '' });
      fetchAdminData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="theme-admin" style={{ padding: '28px' }}>
      {/* Top Banner */}
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(17, 24, 39, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge badge-admin" style={{ marginBottom: '8px' }}>
              <Award size={14} /> Full Database Control Panel
            </span>
            <h1 style={{ color: 'white', fontSize: '1.8rem' }}>System Administrator Dashboard</h1>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>
              Exclusive access to inspect all database accounts, hashed passwords, metrics, and manage user permissions.
            </p>
          </div>
          <button className="btn btn-gold" onClick={() => setShowAddModal(true)}>
            <UserPlus size={16} /> Add User to DB
          </button>
        </div>
      </div>

      {/* Database Analytics Metric Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          <div className="glass-card">
            <span style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600 }}>Total Accounts</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24', marginTop: '6px' }}>
              {stats.user_statistics.total_users}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Registered in Database</div>
          </div>

          <div className="glass-card">
            <span style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600 }}>Government Users</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#60a5fa', marginTop: '6px' }}>
              {stats.user_statistics.government}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Disaster Authorities</div>
          </div>

          <div className="glass-card">
            <span style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600 }}>Organizations / NGOs</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>
              {stats.user_statistics.organization}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Relief & Warehouse Orgs</div>
          </div>

          <div className="glass-card">
            <span style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600 }}>Hospitals</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#67e8f9', marginTop: '6px' }}>
              {stats.user_statistics.hospital || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Emergency Healthcare Providers</div>
          </div>

          <div className="glass-card">
            <span style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600 }}>Disaster Shelters</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fdba74', marginTop: '6px' }}>
              {stats.user_statistics.shelter || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Registered Shelter Facilities</div>
          </div>
        </div>
      )}

      {/* Main Database Table Card */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.3rem', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database color="#f59e0b" /> Database Users & Account Credentials
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            Strictly Restricted to Admin Role
          </span>
        </div>

        {loading ? (
          <div style={{ color: '#9ca3af', padding: '20px', textAlign: 'center' }}>Loading database records...</div>
        ) : error ? (
          <div style={{ color: '#ef4444', padding: '20px' }}>Error: {error}</div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User / Name</th>
                  <th>Email</th>
                  <th>Hashed Password (SHA256)</th>
                  <th>Role</th>
                  <th>Organization / Phone</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>#{u.id}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'white' }}>{u.full_name}</div>
                    </td>
                    <td>{u.email}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#fbbf24', wordBreak: 'break-all', maxWidth: '180px' }}>
                      {u.hashed_password}
                    </td>
                    <td>
                      <span className={`badge ${u.role === 'government' ? 'badge-govt' : ['organization','volunteer'].includes(u.role) ? 'badge-org' : u.role === 'hospital' ? 'badge-hospital' : u.role === 'shelter' ? 'badge-shelter' : u.role === 'admin' ? 'badge-admin' : 'badge-user'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.organization_name || u.phone || '-'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        title="Delete User from Database"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', marginBottom: '16px' }}>Add New Database Account</h2>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  className="input-control"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  className="input-control"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>User Role</label>
                <select
                  className="input-control"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="government">Government</option>
                  <option value="organization">Organization</option>
                  <option value="hospital">Hospital</option>
                  <option value="shelter">Disaster Shelter</option>
                  <option value="volunteer">Volunteer</option>
                  <option value="donor">Donor</option>
                  <option value="beneficiary">Citizen / Beneficiary</option>
                </select>
              </div>

              {['organization', 'hospital', 'shelter'].includes(newUser.role) && (
                <div className="form-group">
                  <label>{newUser.role === 'hospital' ? 'Hospital Name' : newUser.role === 'shelter' ? 'Shelter Name' : 'Organization Name'}</label>
                  <input
                    type="text"
                    className="input-control"
                    value={newUser.organization_name}
                    onChange={(e) => setNewUser({ ...newUser, organization_name: e.target.value })}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-gold" style={{ flex: 1 }}>
                  Create Account
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
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
