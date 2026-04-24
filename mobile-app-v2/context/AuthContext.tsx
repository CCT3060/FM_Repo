/**
 * AuthContext — single source of truth for the logged-in user + capabilities.
 *
 * All screens read capabilities from here. Zero hardcoded role strings anywhere
 * in the UI — every permission check goes through utils/permissions.ts helpers.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { AppUser } from '../utils/api';
import { EMPTY_CAPS, type RoleCapabilities } from '../utils/permissions';

interface AuthState {
  user:         AppUser | null;
  capabilities: RoleCapabilities;
  isLoaded:     boolean;
}

interface AuthCtx extends AuthState {
  setUser: (u: AppUser | null) => void;
  clearUser: () => void;
}

const Ctx = createContext<AuthCtx>({
  user:         null,
  capabilities: EMPTY_CAPS,
  isLoaded:     false,
  setUser:      () => {},
  clearUser:    () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user:     null,
    capabilities: EMPTY_CAPS,
    isLoaded: false,
  });

  const setUser = useCallback((u: AppUser | null) => {
    setState({
      user:         u,
      capabilities: u?.roleCapabilities ?? EMPTY_CAPS,
      isLoaded:     true,
    });
  }, []);

  const clearUser = useCallback(() => {
    setState({ user: null, capabilities: EMPTY_CAPS, isLoaded: true });
  }, []);

  return (
    <Ctx.Provider value={{ ...state, setUser, clearUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }
