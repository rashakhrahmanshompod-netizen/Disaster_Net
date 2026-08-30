import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Eye, EyeOff, AlertCircle, LogIn, ShieldAlert, Warehouse, Radio, Users } from 'lucide-react';

export const Login = ({ onSwitchToRegister, onViewTransparency }) => {
  const { login, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!email || !password) {
      setFormError('Please enter your email and password.');
      return;
    }
    try {
      setLoading(true);
      await login(email, password);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: <ShieldAlert size={20} color="#ef4444" />, text: 'Real-time disaster event monitoring & lifecycle management' },
    { icon: <Radio size={20} color="#f59e0b" />, text: 'Broadcast emergency evacuation alerts nationwide' },
    { icon: <Warehouse size={20} color="#10b981" />, text: 'Warehouse resource inventory & low stock alerts' },
    { icon: <Users size={20} color="#8b5cf6" />, text: 'Intelligent route optimization & relief convoy dispatch' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: '900px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'center' }}>

        {/* Left: Brand + Feature List */}
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #ef4444, #3b82f6)',
            width: '68px',
            height: '68px',
            borderRadius: '20px',
            marginBottom: '20px',
            boxShadow: '0 8px 30px rgba(239, 68, 68, 0.4)',
          }}>
            <Shield size={38} color="white" />
          </div>

          <h1 style={{ fontSize: '2.6rem', fontWeight: 800, color: 'white', lineHeight: 1.1, marginBottom: '12px' }}>
            Disaster<span style={{ color: '#ef4444' }}>Net</span>
          </h1>

          <p style={{ color: '#9ca3af', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '28px' }}>
            Intelligent Disaster Response & Resource Coordination System for Bangladesh.
          </p>

          {/* Feature list — no credentials shown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {features.map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(31,41,55,0.5)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
                {icon}
                <span style={{ color: '#d1d5db', fontSize: '0.88rem' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Login Form */}
        <div className="glass-card">
          <h2 style={{ color: 'white', fontSize: '1.5rem', marginBottom: '6px' }}>Sign In to Your Portal</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.88rem', marginBottom: '24px' }}>
            Enter your registered email/name and password.
          </p>

          {(formError || error) && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', color: '#f87171', fontSize: '0.9rem' }}>
              <AlertCircle size={16} /> {formError || error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address or Registered Name</label>
              <input
                id="login-email"
                type="text"
                className="input-control"
                required
                placeholder="your@email.com or registered name"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: '44px' }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', padding: '14px', fontSize: '1rem', marginTop: '8px' }}
            >
              <LogIn size={18} />
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px', fontSize: '0.88rem' }}>
            Don't have an account?{' '}
            <span
              onClick={onSwitchToRegister}
              style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}
            >
              Register Now
            </span>
          </p>
          <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '10px', fontSize: '0.86rem' }}><span onClick={onViewTransparency} style={{ color: '#34d399', cursor: 'pointer', fontWeight: 600 }}>View Public Transparency Portal</span></p>
        </div>

      </div>
    </div>
  );
};
