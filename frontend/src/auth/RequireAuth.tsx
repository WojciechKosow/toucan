import { Navigate } from 'react-router-dom';
import { useAuth } from './authContext';

/** Gate for authenticated routes: no stored token → bounce to /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
