import React, { useEffect, useState } from 'react';
import { BarChart2, HandCoins, PackageCheck, ShieldCheck, Users } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

export const PublicTransparency = ({ onBack }) => {
  const [data, setData] = useState({ summary: {}, campaigns: [], completed_distributions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/public/transparency`)
      .then((res) => res.json())
      .then(setData)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const summary = data.summary || {};

  return (
    <div style={{ minHeight: '100vh', padding: '28px' }}>
      <div className="glass-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(17, 24, 39, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div>
            <span className="badge badge-govt" style={{ marginBottom: '8px' }}><ShieldCheck size={14} /> Public Transparency Portal</span>
            <h1 style={{ color: 'white', fontSize: '1.8rem' }}>Disaster Relief Funding & Impact</h1>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '4px' }}>Track campaign funding, allocations, completed field work and aid distribution records.</p>
          </div>
          {onBack && <button className="btn btn-secondary" onClick={onBack}>Back</button>}
        </div>
      </div>

      <div className="feature-stat-grid">
        {[
          { icon: <HandCoins size={24} color="#10b981" />, label: 'Donations Received', value: `৳${Number(summary.total_donations_bdt || 0).toLocaleString()}` },
          { icon: <BarChart2 size={24} color="#3b82f6" />, label: 'Funds Utilized', value: `৳${Number(summary.funds_utilized_bdt || 0).toLocaleString()}` },
          { icon: <PackageCheck size={24} color="#f59e0b" />, label: 'Aid Distributions', value: summary.aid_distributions || 0 },
          { icon: <Users size={24} color="#8b5cf6" />, label: 'People Rescued', value: summary.people_rescued || 0 },
        ].map((item) => (
          <div className="glass-card feature-stat" key={item.label}>
            {item.icon}
            <div><strong>{item.value}</strong><span>{item.label}</span></div>
          </div>
        ))}
      </div>

      <div className="glass-card">
        <h2 className="feature-card-title"><HandCoins color="#10b981" /> Active Campaign Transparency</h2>
        {loading ? (
          <div style={{ color: '#9ca3af', padding: '20px', textAlign: 'center' }}>Loading transparency records...</div>
        ) : data.campaigns.length === 0 ? (
          <div style={{ color: '#9ca3af', padding: '20px', textAlign: 'center' }}>No campaigns have been published yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data.campaigns.map((campaign) => {
              const progress = campaign.target_amount > 0 ? Math.min(100, (campaign.collected_amount / campaign.target_amount) * 100) : 0;
              return (
                <div key={campaign.id} style={{ background: 'rgba(31,41,55,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ color: 'white', fontSize: '1.05rem' }}>{campaign.title}</h3>
                      <div style={{ color: '#34d399', fontSize: '0.82rem', marginTop: '3px' }}>{campaign.organization_name}</div>
                    </div>
                    <span className="badge badge-org">{campaign.status}</span>
                  </div>
                  <p style={{ color: '#d1d5db', fontSize: '0.85rem', lineHeight: 1.6, marginTop: '10px' }}>{campaign.description}</p>
                  <div style={{ marginTop: '14px', background: 'rgba(17,24,39,0.8)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d1d5db', fontSize: '0.82rem', marginBottom: '7px' }}>
                      <span>Raised: <strong style={{ color: 'white' }}>৳{Number(campaign.collected_amount).toLocaleString()}</strong></span>
                      <span>Target: ৳{Number(campaign.target_amount).toLocaleString()}</span>
                    </div>
                    <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(135deg, #10b981, #059669)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '18px', marginTop: '10px', color: '#9ca3af', fontSize: '0.8rem' }}>
                      <span>{campaign.donation_count} donations</span>
                      <span>Utilized: ৳{Number(campaign.utilized_amount).toLocaleString()}</span>
                      <span>Available: ৳{Number(campaign.remaining_amount).toLocaleString()}</span>
                    </div>
                  </div>
                  {campaign.allocations?.length > 0 && (
                    <div className="data-table-container" style={{ marginTop: '12px' }}>
                      <table className="data-table">
                        <thead><tr><th>Allocation</th><th>Amount</th><th>Purpose</th></tr></thead>
                        <tbody>{campaign.allocations.map((a) => <tr key={a.id}><td>{a.category}</td><td>৳{Number(a.amount).toLocaleString()}</td><td>{a.description}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ marginTop: '20px' }}>
        <h2 className="feature-card-title"><PackageCheck color="#10b981" /> Completed Distribution Records</h2>
        <div className="data-table-container"><table className="data-table"><thead><tr><th>Donor</th><th>Amount Utilized</th><th>Campaign / Mission</th><th>Volunteer</th><th>Tracking ID</th><th>Date</th></tr></thead><tbody>
          {(data.completed_distributions || []).length === 0 ? <tr><td colSpan="6">No donor-funded distribution records have been completed yet.</td></tr> : (data.completed_distributions || []).map(d => <tr key={d.id}><td><strong style={{ color: 'white' }}>{d.donor_name}</strong></td><td>৳{Number(d.amount).toLocaleString()}</td><td>{d.campaign_title}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{d.mission_title || 'General campaign distribution'}</div></td><td>{d.volunteer_name}</td><td>{d.tracking_id}</td><td>{new Date(d.created_at).toLocaleString()}</td></tr>)}
        </tbody></table></div>
      </div>
    </div>
  );
};
