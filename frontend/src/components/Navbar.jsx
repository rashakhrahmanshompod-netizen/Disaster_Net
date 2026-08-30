import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, User, Users, LogOut, Trash2, Building, Radio, Award, AlertTriangle, Home } from 'lucide-react';

export const Navbar = ({ activeTab, setActiveTab }) => {
  const { user, logout, deleteAccount } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState(false);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return <span className="badge badge-admin"><Award size={13} /> Admin (Full DB)</span>;
      case 'government':
        return <span className="badge badge-govt"><Radio size={13} /> Govt Authority</span>;
      case 'organization':
        return <span className="badge badge-org"><Building size={13} /> Organization</span>;
      case 'hospital':
        return <span className="badge badge-hospital"><Building size={13} /> Hospital</span>;
      case 'shelter':
        return <span className="badge badge-shelter"><Home size={13} /> Disaster Shelter</span>;
      case 'volunteer':
        return <span className="badge badge-org"><Users size={13} /> Volunteer</span>;
      case 'donor':
        return <span className="badge badge-user"><User size={13} /> Donor</span>;
      case 'beneficiary':
      default:
        return <span className="badge badge-user"><User size={13} /> Citizen / Beneficiary</span>;
    }
  };

  const handleDeleteProfile = async () => {
    if (window.confirm('Are you sure you want to permanently delete your account profile? This action cannot be undone.')) {
      try {
        await deleteAccount();
        alert('Your account profile has been deleted.');
      } catch (err) {
        alert('Deletion failed: ' + err.message);
      }
    }
  };

  return (
    <>
      <nav style={{
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        padding: '14px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #ef4444, #3b82f6)',
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
          }}>
            <Shield size={24} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white', margin: 0 }}>
              Disaster<span style={{ color: '#ef4444' }}>Net</span>
            </h1>
          </div>
        </div>

        {/* Center Nav tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('dashboard')}
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            Dashboard
          </button>
          <button
            className={`btn ${activeTab === 'map' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('map')}
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            Disaster Map & Shelters
          </button>
          <button
            className={`btn ${activeTab === 'alerts' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('alerts')}
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            Emergency Alerts
          </button>
          <button
            className={`btn ${activeTab === 'transparency' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('transparency')}
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            Transparency
          </button>
        </div>

        {/* User Info & Actions */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              onClick={() => setShowProfileModal(true)}
              style={{
                cursor: 'pointer',
                textAlign: 'right',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white' }}>
                {user.full_name}
              </div>
              <div>{getRoleBadge(user.role)}</div>
            </div>

            <button
              onClick={() => setShowProfileModal(true)}
              className="btn btn-secondary"
              title="User Profile & Settings"
              style={{ padding: '8px 12px' }}
            >
              <User size={16} />
            </button>

            <button
              onClick={logout}
              className="btn btn-danger"
              title="Log Out"
              style={{ padding: '8px 12px' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : null}
      </nav>

      {/* User Profile Input & Account Settings Modal */}
      {showProfileModal && user && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.3rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User color="#3b82f6" /> User Profile & Account Input
              </h2>
              <button
                onClick={() => setShowProfileModal(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.4rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div className="glass-card" style={{ marginBottom: '20px', background: 'rgba(31, 41, 55, 0.5)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                <div>
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Full Name</span>
                  <div style={{ fontWeight: 600, color: 'white' }}>{user.full_name}</div>
                </div>
                <div>
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Registered Email</span>
                  <div style={{ fontWeight: 600, color: 'white' }}>{user.email}</div>
                </div>
                <div>
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>System User Role</span>
                  <div>{getRoleBadge(user.role)}</div>
                </div>
                <div>
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Phone / Org</span>
                  <div style={{ fontWeight: 600, color: 'white' }}>
                    {user.organization_name || user.phone || 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
              <h4 style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <AlertTriangle size={16} /> Danger Zone: Account Deletion
              </h4>
              <p style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '12px' }}>
                Deleting your profile will permanently remove your account login credentials from the database.
              </p>
              <button
                onClick={handleDeleteProfile}
                className="btn btn-danger"
                style={{ width: '100%' }}
              >
                <Trash2 size={16} /> Delete Profile & Account
              </button>
            </div>

            <button
              onClick={() => setShowProfileModal(false)}
              className="btn btn-secondary"
              style={{ width: '100%' }}
            >
              Close Window
            </button>
          </div>
        </div>
      )}
    </>
  );
};
