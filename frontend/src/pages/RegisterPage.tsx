import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { registerUser } from '../lib/endpoints';
import { ApiError } from '../lib/api';
import { useAuth } from '../auth/authContext';

export function RegisterPage() {
  const { token } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => registerUser({ email, name, password }),
  });

  if (token) return <Navigate to="/" replace />;

  const error = mutation.error;
  const errorMessage = error instanceof ApiError ? error.message : error ? String(error) : null;

  if (mutation.isSuccess) {
    return (
      <div className="auth-shell">
        <div className="card auth-card">
          <div className="brand">
            <span className="brand-mark">🦜</span>
            <span className="brand-name">Toucan</span>
          </div>
          <h1>Check your email</h1>
          <p className="alert alert-success">{mutation.data}</p>
          <p className="hint">
            You must verify your account before logging in. In local dev there's no working mail
            server — enable your user directly in the database:
            <code className="code-block">
              UPDATE users SET enabled=true WHERE email='{email || 'you@example.com'}';
            </code>
          </p>
          <Link className="btn btn-primary" to="/login">
            Go to log in
          </Link>
        </div>
      </div>
    );
  }

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
        <h1>Create your account</h1>

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
          <span>Name</span>
          <input
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {errorMessage && <p className="alert alert-error">{errorMessage}</p>}

        <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating…' : 'Create account'}
        </button>

        <p className="hint">
          Local dev has no mail server, so the confirmation email can't be sent — this step may show
          an error even though your account was created. Verify it by enabling the user in the
          database (see the frontend README), then log in.
        </p>

        <p className="muted switch-link">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
