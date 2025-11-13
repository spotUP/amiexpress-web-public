import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(username, password);
      navigate('/system');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bbs-bg">
      <div className="w-full max-w-md">
        <div className="card">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-bbs-accent mb-2">AmiExpress</h1>
            <p className="text-bbs-muted">BBS Configuration Portal</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-bbs-accent/10 border border-bbs-accent text-bbs-accent px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field w-full"
                placeholder="Enter your username"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center space-x-2"
            >
              <LogIn size={20} />
              <span>{isLoading ? 'Logging in...' : 'Login'}</span>
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-bbs-primary">
            <p className="text-xs text-bbs-muted text-center">
              Sysop-level access required
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
