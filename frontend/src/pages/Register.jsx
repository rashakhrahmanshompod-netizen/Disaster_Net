import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, User, Building, Radio, Eye, EyeOff, AlertCircle, CheckCircle, Smartphone, Key } from 'lucide-react';

export const Register = ({ onSwitchToLogin, onViewTransparency }) => {
  const { register, error } = useAuth();
  const [step, setStep] = useState(1); // step 1: choose role, step 2: fill details
  const [selectedRole, setSelectedRole] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    organization_name: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // SMS OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [otpMessage, setOtpMessage] = useState(null);
  const [otpError, setOtpError] = useState(null);

  const roles = [
    {
      key: 'volunteer',
      label: 'Volunteer',
      subtitle: 'Verified Field Responder',
      icon: <User size={28} />,
      accent: '#10b981',
      description: 'Complete identity verification, accept field missions, scan aid QR codes, and submit field or rescue reports.',
    },
    {
      key: 'donor',
      label: 'Donor',
      subtitle: 'Individual or Organization Donor',
      icon: <User size={28} />,
      accent: '#8b5cf6',
      description: 'Browse verified campaigns, donate through bKash, track contributions, receipts, transparency and impact.',
    },
    {
      key: 'beneficiary',
      label: 'Citizen / Beneficiary',
      subtitle: 'Disaster-Affected Citizen',
      icon: <User size={28} />,
      accent: '#3b82f6',
      description: 'Request assistance, receive an aid QR code, submit SOS alerts, confirm assistance and provide feedback.',
    },
    {
      key: 'organization',
      label: 'Organization / NGO',
      subtitle: 'Company or Relief Organization',
      icon: <Building size={28} />,
      accent: '#10b981',
      description: 'Manage warehouse inventories, fulfill resource requests, and run intelligent delivery logistics.',
    },
    {
      key: 'government',
      label: 'Government Authority',
      subtitle: 'Disaster Management Agency',
      icon: <Radio size={28} />,
      accent: '#3b82f6',
      description: 'Declare national disaster events, broadcast emergency evacuation alerts, and supervise lifecycle.',
    },
    {
      key: 'hospital',
      label: 'Hospital',
      subtitle: 'Emergency Healthcare Provider',
      icon: <span style={{ fontSize: '28px' }}>🏥</span>,
      accent: '#06b6d4',
      description: 'Request emergency medicine and equipment, update patient statistics, report capacity, track supplies and expenditure.',
    },
    {
      key: 'shelter',
      label: 'Disaster Shelter',
      subtitle: 'Shelter for Displaced Citizens',
      icon: <span style={{ fontSize: '28px' }}>🏠</span>,
      accent: '#f97316',
      description: 'Manage shelter capacity, occupancy and resources, request supplies, report shortages and record distributions.',
    },
  ];

  const roleBadgeClass = (role) => {
    if (role === 'government') return 'badge-govt';
    if (['organization', 'volunteer'].includes(role)) return 'badge-org';
    if (role === 'hospital') return 'badge-hospital';
    if (role === 'shelter') return 'badge-shelter';
    return 'badge-user';
  };

  const handleSendOtp = async () => {
    setOtpError(null);
    setOtpMessage(null);
    const phoneToVerify = formData.phone.trim();
    if (!phoneToVerify) {
      setOtpError('Please enter a valid phone number first.');
      return;
    }
    try {
      setOtpSending(true);
      const res = await fetch('/api/sms/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneToVerify }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to send OTP code');
      }
      setOtpSent(true);
      if (data.demo_otp) {
        setOtpMessage(`Verification code sent via SMS! (Demo simulation code: ${data.demo_otp})`);
      } else {
        setOtpMessage(data.message || `Verification OTP sent via SMS to ${phoneToVerify}`);
      }
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpError(null);
    const code = otpCode.trim();
    if (!code || code.length !== 6) {
      setOtpError('Please enter the 6-digit OTP code.');
      return;
    }
    try {
      setOtpVerifying(true);
      const res = await fetch('/api/sms/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone.trim(), otp: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Invalid verification OTP code');
      }
      setPhoneVerified(true);
      setVerifiedPhone(formData.phone.trim());
      setOtpMessage('✓ Mobile number verified successfully via Twilio SMS!');
      setOtpError(null);
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (formData.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    // If phone number is entered, verify OTP first
    if (formData.phone.trim() && (!phoneVerified || verifiedPhone !== formData.phone.trim())) {
      setFormError('Please verify your mobile number with the SMS OTP code before completing registration.');
      if (!otpSent) {
        handleSendOtp();
      }
      return;
    }

    try {
      setLoading(true);
      await register({
        full_name: formData.full_name,
        email: formData.email,
        password: formData.password,
        role: selectedRole,
        organization_name: formData.organization_name || null,
        phone: formData.phone.trim() || null,
      });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: step === 1 ? '980px' : '520px' }}>

        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #ef4444, #3b82f6)',
            width: '64px',
            height: '64px',
            borderRadius: '18px',
            marginBottom: '16px',
            boxShadow: '0 8px 30px rgba(239, 68, 68, 0.4)',
          }}>
            <Shield size={36} color="white" />
          </div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: 'white' }}>
            Disaster<span style={{ color: '#ef4444' }}>Net</span>
          </h1>
          <p style={{ color: '#9ca3af', marginTop: '6px' }}>
            {step === 1 ? 'Select your user role to create an account' : 'Complete your registration profile'}
          </p>
        </div>

        {/* Step 1: Role Selection */}
        {step === 1 && (
          <div>
            <h2 style={{ textAlign: 'center', color: 'white', fontSize: '1.3rem', marginBottom: '24px' }}>
              Choose Your Account Type
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              {roles.map((role) => (
                <div
                  key={role.key}
                  onClick={() => setSelectedRole(role.key)}
                  className="glass-card"
                  style={{
                    cursor: 'pointer',
                    border: selectedRole === role.key ? `2px solid ${role.accent}` : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: selectedRole === role.key ? `0 0 20px ${role.accent}50` : '',
                    transition: 'all 0.2s',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {selectedRole === role.key && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                      <CheckCircle size={20} color={role.accent} />
                    </div>
                  )}
                  <div style={{ color: role.accent, marginBottom: '12px' }}>{role.icon}</div>
                  <h3 style={{ color: 'white', fontSize: '1.1rem', marginBottom: '4px' }}>{role.label}</h3>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '8px' }}>{role.subtitle}</div>
                  <p style={{ fontSize: '0.82rem', color: '#d1d5db', lineHeight: 1.5 }}>{role.description}</p>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
              disabled={!selectedRole}
              onClick={() => setStep(2)}
            >
              Continue as {roles.find(r => r.key === selectedRole)?.label || '...'} →
            </button>

            <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px', fontSize: '0.9rem' }}>
              Already have an account?{' '}
              <span
                onClick={onSwitchToLogin}
                style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}
              >
                Sign In
              </span>
            </p>
            <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '10px', fontSize: '0.86rem' }}><span onClick={onViewTransparency} style={{ color: '#34d399', cursor: 'pointer', fontWeight: 600 }}>View Public Transparency Portal</span></p>
          </div>
        )}

        {/* Step 2: Registration Form */}
        {step === 2 && (
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <button
                onClick={() => setStep(1)}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                ← Back
              </button>
              <div>
                <h2 style={{ color: 'white', fontSize: '1.25rem' }}>Create Your Account</h2>
                <span className={`badge ${roleBadgeClass(selectedRole)}`}>
                  {roles.find(r => r.key === selectedRole)?.label}
                </span>
              </div>
            </div>

            {(formError || error) && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', color: '#f87171' }}>
                <AlertCircle size={16} /> {formError || error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  placeholder={['organization', 'hospital', 'shelter'].includes(selectedRole) ? 'Primary contact person / coordinator' : 'Your full name'}
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Email Address *</label>
                <input
                  type="email"
                  className="input-control"
                  required
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input-control"
                    required
                    placeholder="Minimum 6 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    style={{ paddingRight: '44px' }}
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

              <div className="form-group">
                <label>Confirm Password *</label>
                <input
                  type="password"
                  className="input-control"
                  required
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                />
              </div>

              {['organization', 'hospital', 'shelter'].includes(selectedRole) && (
                <div className="form-group">
                  <label>{selectedRole === 'hospital' ? 'Hospital Name *' : selectedRole === 'shelter' ? 'Shelter Name *' : 'Organization Name *'}</label>
                  <input
                    type="text"
                    className="input-control"
                    required
                    placeholder={selectedRole === 'hospital' ? 'e.g. City Emergency Medical College Hospital' : selectedRole === 'shelter' ? 'e.g. Sunamganj Emergency Shelter #4' : 'e.g. BD Red Crescent Society'}
                    value={formData.organization_name}
                    onChange={(e) => setFormData({ ...formData, organization_name: e.target.value })}
                  />
                </div>
              )}

              {selectedRole === 'donor' && (
                <div className="form-group">
                  <label>Organization Name (Optional)</label>
                  <input type="text" className="input-control" placeholder="For organizational donors" value={formData.organization_name} onChange={(e) => setFormData({ ...formData, organization_name: e.target.value })} />
                </div>
              )}

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Smartphone size={15} color="#38bdf8" /> Mobile Number (SMS Alerts & Verification)
                  </label>
                  {phoneVerified && verifiedPhone === formData.phone.trim() && (
                    <span style={{ fontSize: '0.78rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      <CheckCircle size={14} color="#10b981" /> Verified
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="+8801711223344 or 01711223344"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData({ ...formData, phone: e.target.value });
                      if (phoneVerified) setPhoneVerified(false);
                      setOtpSent(false);
                      setOtpMessage(null);
                      setOtpError(null);
                    }}
                    style={{ flex: 1 }}
                  />
                  {formData.phone.trim() && (!phoneVerified || verifiedPhone !== formData.phone.trim()) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSendOtp}
                      disabled={otpSending}
                      style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0 14px' }}
                    >
                      {otpSending ? 'Sending...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                    </button>
                  )}
                </div>

                {/* OTP Verification Box */}
                {otpSent && (!phoneVerified || verifiedPhone !== formData.phone.trim()) && (
                  <div style={{
                    marginTop: '10px',
                    padding: '12px 14px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '10px',
                  }}>
                    <label style={{ fontSize: '0.82rem', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Key size={14} /> Enter 6-Digit SMS OTP Code
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        maxLength={6}
                        className="input-control"
                        placeholder="e.g. 123456"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        style={{ textAlign: 'center', letterSpacing: '4px', fontWeight: 700, fontSize: '1.1rem', maxWidth: '160px' }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleVerifyOtp}
                        disabled={otpVerifying || otpCode.length !== 6}
                        style={{ padding: '0 16px', fontSize: '0.85rem' }}
                      >
                        {otpVerifying ? 'Verifying...' : 'Verify OTP'}
                      </button>
                    </div>
                  </div>
                )}

                {/* OTP Feedback Messages */}
                {otpMessage && (
                  <div style={{ marginTop: '8px', fontSize: '0.82rem', color: phoneVerified ? '#34d399' : '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={14} /> {otpMessage}
                  </div>
                )}
                {otpError && (
                  <div style={{ marginTop: '8px', fontSize: '0.82rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={14} /> {otpError}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', padding: '14px', fontSize: '1rem', marginTop: '8px' }}
              >
                {loading ? 'Creating Account...' : 'Register & Enter DisasterNet'}
              </button>
            </form>

            <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px', fontSize: '0.9rem' }}>
              Already have an account?{' '}
              <span
                onClick={onSwitchToLogin}
                style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}
              >
                Sign In
              </span>
            </p>
            <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '10px', fontSize: '0.86rem' }}><span onClick={onViewTransparency} style={{ color: '#34d399', cursor: 'pointer', fontWeight: 600 }}>View Public Transparency Portal</span></p>
          </div>
        )}
      </div>
    </div>
  );
};
