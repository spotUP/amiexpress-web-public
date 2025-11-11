import { useState, useEffect } from 'react';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [autoLogin, setAutoLogin] = useState(false);

  useEffect(() => {
    // Load auto-login setting from localStorage
    const saved = localStorage.getItem('bbs_auto_login_enabled');
    setAutoLogin(saved === 'true');
  }, []);

  const handleToggle = () => {
    const newValue = !autoLogin;
    setAutoLogin(newValue);

    // Save to localStorage
    localStorage.setItem('bbs_auto_login_enabled', String(newValue));

    // If disabling, clear saved credentials
    if (!newValue) {
      localStorage.removeItem('bbs_saved_username');
      localStorage.removeItem('bbs_saved_password');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
        }}
      />

      {/* Settings Panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#1a1a1a',
          border: '2px solid #00ff00',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '400px',
          zIndex: 9999,
          fontFamily: 'monospace',
          color: '#00ff00',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '1px solid #00ff00',
          paddingBottom: '12px',
        }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#00ff00',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px',
            }}
          >
            ×
          </button>
        </div>

        {/* Auto-Login Toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0',
        }}>
          <div>
            <div style={{ fontSize: '16px', marginBottom: '4px' }}>
              Quick Connect (Auto-Login)
            </div>
            <div style={{ fontSize: '12px', color: '#888', maxWidth: '280px' }}>
              Save your credentials for quick login. Your password will be stored locally.
            </div>
          </div>

          {/* Toggle Switch */}
          <label style={{
            position: 'relative',
            display: 'inline-block',
            width: '50px',
            height: '26px',
            flexShrink: 0,
            marginLeft: '16px',
          }}>
            <input
              type="checkbox"
              checked={autoLogin}
              onChange={handleToggle}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute',
              cursor: 'pointer',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: autoLogin ? '#00ff00' : '#555',
              transition: '0.3s',
              borderRadius: '26px',
            }}>
              <span style={{
                position: 'absolute',
                content: '',
                height: '18px',
                width: '18px',
                left: autoLogin ? '28px' : '4px',
                bottom: '4px',
                backgroundColor: '#000',
                transition: '0.3s',
                borderRadius: '50%',
              }} />
            </span>
          </label>
        </div>

        {/* Security Warning */}
        {autoLogin && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#2a2a00',
            border: '1px solid #ffff00',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#ffff00',
          }}>
            <strong>⚠ Security Note:</strong> Your credentials will be stored in your browser's local storage.
            Only enable this on trusted devices.
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid #333',
          textAlign: 'right',
        }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#00ff00',
              color: '#000',
              border: 'none',
              padding: '8px 24px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
