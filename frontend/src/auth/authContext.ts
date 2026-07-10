import { createContext, useContext } from 'react';
import type { UserDTO } from '../lib/types';

export interface AuthContextValue {
  token: string | null;
  user: UserDTO | null;
  /** Persist a successful login and flip the app into the authenticated state. */
  login: (token: string, user: UserDTO) => void;
  /** Clear credentials and route back to /login. */
  logout: () => void;
}

// Kept in its own module (no component export) so React Fast Refresh stays happy.
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
