import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TOKEN_KEY, setUnauthorizedHandler } from '../lib/api';
import type { UserDTO } from '../lib/types';
import { AuthContext } from './authContext';

const USER_KEY = 'toucan.user';

function readStoredUser(): UserDTO | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserDTO;
  } catch {
    return null;
  }
}

/**
 * There is no /me endpoint: "has a stored token" is our definition of logged-in,
 * and a 401 from any call is what invalidates it.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<UserDTO | null>(() => readStoredUser());

  const login = useCallback((newToken: string, newUser: UserDTO) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const logout = useCallback(() => {
    clear();
    navigate('/login', { replace: true });
  }, [clear, navigate]);

  // Let the API client trigger the same clear+redirect on any 401.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
      navigate('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [clear, navigate]);

  const value = useMemo(() => ({ token, user, login, logout }), [token, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
