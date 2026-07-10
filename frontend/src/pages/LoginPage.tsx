import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { loginUser } from '../lib/endpoints';
import { ApiError } from '../lib/api';
import { useAuth } from '../auth/authContext';

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => loginUser({ email, password }),
    onSuccess: (res) => {
      login(res.token, res.user);
      navigate('/', { replace: true });
    },
  });

  // Already logged in → skip the form.
  if (token) return <Navigate to="/" replace />;

  // The backend surfaces a specific reason ("Please verify your email address before logging
  // in." / "Invalid email or password.") when it exposes exception messages. When it doesn't
  // (a bare 500), fall back to a friendly line — the verify hint below still covers that case.
  const rawError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? String(mutation.error)
        : null;
  const errorMessage =
    rawError && /^Request failed \(\d+\)\.$/.test(rawError)
      ? "We couldn't log you in. Check your email and password below."
      : rawError;

  return (
    <div className="auth-shell">
      <form
        className="card auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="brand">
          <span className="brand-mark">🦜</span>
          <span className="brand-name">Toucan</span>
        </div>
        <h1>Log in</h1>
        <p className="muted">Turn a prompt into a short explainer animation.</p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {errorMessage && <p className="alert alert-error">{errorMessage}</p>}

        <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Logging in…' : 'Log in'}
        </button>

        <p className="hint">
          Just registered? You must <strong>verify your email</strong> before you can log in. In
          local dev there's no mail server — enable your account directly in the database (see the
          frontend README).
        </p>

        <p className="muted switch-link">
          No account? <Link to="/register">Create one</Link>
        </p>
      </form>
    </div>
  );
}
