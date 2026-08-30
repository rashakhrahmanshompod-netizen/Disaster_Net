import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AdminDashboard } from './pages/AdminDashboard';
import { GovtDashboard } from './pages/GovtDashboard';
import { GovtViewDashboard } from './pages/GovtViewDashboard';
import { OrgDashboard } from './pages/OrgDashboard';
import { CitizenDashboard } from './pages/CitizenDashboard';
import { HospitalDashboard } from './pages/HospitalDashboard';
import { ShelterDashboard } from './pages/ShelterDashboard';
import { VolunteerDashboard } from './pages/VolunteerDashboard';
import { DonorDashboard } from './pages/DonorDashboard';
import { BeneficiaryDashboard } from './pages/BeneficiaryDashboard';
import { PublicTransparency } from './pages/PublicTransparency';
import { GovernmentOversight } from './pages/GovernmentOversight';
import { Navbar } from './components/Navbar';
import { AlertsBanner } from './components/AlertsBanner';
import { DisasterMap } from './components/DisasterMap';
import './index.css';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

const AppContent = () => {
  const { user, loading } = useAuth();

  // The unauthenticated landing page is registration. Public dashboard is no longer part of the app flow.
  const [authPage, setAuthPage] = useState('register');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [alerts, setAlerts] = useState([]);
  const [disasters, setDisasters] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (user) {
      fetchSharedData();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    const handleSharedDataChanged = () => {
      fetchSharedData();
    };

    window.addEventListener('disasternet:shared-data-changed', handleSharedDataChanged);
    return () => {
      window.removeEventListener('disasternet:shared-data-changed', handleSharedDataChanged);
    };
  }, [user]);

  const fetchSharedData = async () => {
    try {
      const [alertRes, disRes, invRes, reqRes] = await Promise.all([
        fetch(`${API_BASE}/disasters/alerts`),
        fetch(`${API_BASE}/disasters/`),
        fetch(`${API_BASE}/inventory/items`),
        fetch(`${API_BASE}/inventory/requests`),
      ]);
      if (alertRes.ok) setAlerts(await alertRes.json());
      if (disRes.ok) setDisasters(await disRes.json());
      if (invRes.ok) setInventoryItems(await invRes.json());
      if (reqRes.ok) setRequests(await reqRes.json());
    } catch (err) {
      console.error('Error loading shared data:', err);
    }
  };

  // ── Loading spinner ──
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '16px',
          background: 'linear-gradient(135deg, #ef4444, #3b82f6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'none',
        }}>
          <span style={{ fontSize: '1.5rem' }}>🛡️</span>
        </div>
        <p style={{ color: '#9ca3af' }}>Loading DisasterNet...</p>
      </div>
    );
  }

  // ── Not logged in → registration first, with a direct switch to sign in ──
  if (!user) {
    if (authPage === 'transparency') {
      return <PublicTransparency onBack={() => setAuthPage('register')} />;
    }
    if (authPage === 'login') {
      return <Login onSwitchToRegister={() => setAuthPage('register')} onViewTransparency={() => setAuthPage('transparency')} />;
    }
    return <Register onSwitchToLogin={() => setAuthPage('login')} onViewTransparency={() => setAuthPage('transparency')} />;
  }

  // ── Logged in → role dashboard with navigation tabs ──
  const renderRoleDashboard = () => {
    if (activeTab === 'map') {
      return (
        <div style={{ padding: '28px' }}>
          <DisasterMap
            disasters={disasters}
            inventories={inventoryItems}
            requests={requests}
          />
        </div>
      );
    }

    if (activeTab === 'transparency') {
      return <PublicTransparency />;
    }

    if (activeTab === 'alerts') {
      return (
        <div style={{ padding: '28px' }}>
          <div className="glass-card">
            <h2 style={{ color: 'white', marginBottom: '20px', fontSize: '1.3rem' }}>
              All Emergency Alerts & Evacuation Notices
            </h2>
            {alerts.length === 0 ? (
              <div style={{ color: '#9ca3af', padding: '20px', textAlign: 'center' }}>No active alerts at this time.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {alerts.map((al) => (
                  <div key={al.id} style={{ background: 'rgba(31,41,55,0.7)', border: `1px solid ${al.alert_level === 'Evacuation' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`, borderRadius: '14px', padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className={`badge ${al.alert_level === 'Evacuation' || al.alert_level === 'Severe' ? 'badge-critical' : 'badge-warning'}`}>
                        {al.alert_level}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                        {new Date(al.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 style={{ color: 'white', fontSize: '1.1rem' }}>{al.title}</h3>
                    <p style={{ color: '#d1d5db', fontSize: '0.9rem', marginTop: '6px', lineHeight: 1.6 }}>{al.message}</p>
                    <div style={{ marginTop: '10px', fontSize: '0.82rem', color: '#60a5fa' }}>
                      Target Area: <strong>{al.affected_area}</strong> | Published by: {al.published_by}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Main role dashboards
    switch (user.role) {
      case 'admin':
        return <AdminDashboard />;
      case 'government':
        return (
          <div>
            <GovtDashboard />
            <GovtViewDashboard />
            <GovernmentOversight />
          </div>
        );
      case 'organization':
        return <OrgDashboard />;
      case 'volunteer':
        return <VolunteerDashboard />;
      case 'donor':
        return <DonorDashboard />;
      case 'beneficiary':
        return <BeneficiaryDashboard />;
      case 'hospital':
        return <HospitalDashboard />;
      case 'shelter':
        return <ShelterDashboard />;
      default:
        return <CitizenDashboard />;
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      {activeTab === 'dashboard' && alerts.length > 0 && (
        <AlertsBanner alerts={alerts} />
      )}
      <main>{renderRoleDashboard()}</main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
