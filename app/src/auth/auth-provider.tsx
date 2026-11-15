import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { loginRequest, meRequest, signupRequest, type SignupInput, type User } from '@/api/auth';
import { ApiError, setSessionExpiredHandler } from '@/api/client';

import { tokenStorage } from './token-storage';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User };

type AuthContextValue = {
  status: AuthState['status'];
  user: User | null;
  login: (phoneOrEmail: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Knows whether someone is logged in, and handles log in, sign up and log out. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const signOutLocally = useCallback(async () => {
    await tokenStorage.clear();
    setState({ status: 'signedOut' });
  }, []);

  // When the refresh token can't be used any more, log out.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      signOutLocally();
    });
    return () => setSessionExpiredHandler(null);
  }, [signOutLocally]);

  // On start-up: if we have tokens, check them by loading the profile.
  useEffect(() => {
    (async () => {
      const refresh = await tokenStorage.getRefresh();
      if (!refresh) {
        setState({ status: 'signedOut' });
        return;
      }
      const cached = await tokenStorage.getUser<User>();
      try {
        const user = await meRequest(); // refreshes the access token if needed
        await tokenStorage.saveUser(user);
        setState({ status: 'signedIn', user });
      } catch (error) {
        if (error instanceof ApiError && error.isNetworkError && cached) {
          // Offline: stay logged in with the profile saved last time.
          setState({ status: 'signedIn', user: cached });
        } else if (error instanceof ApiError && error.isNetworkError) {
          setState({ status: 'signedOut' }); // keep the tokens; try again next launch
        } else {
          await signOutLocally();
        }
      }
    })();
  }, [signOutLocally]);

  const finishLogin = useCallback(async (user: User, access: string, refresh: string) => {
    await tokenStorage.saveTokens(access, refresh);
    await tokenStorage.saveUser(user);
    setState({ status: 'signedIn', user });
  }, []);

  const login = useCallback(
    async (phoneOrEmail: string, password: string) => {
      const { user, access, refresh } = await loginRequest(phoneOrEmail, password);
      await finishLogin(user, access, refresh);
    },
    [finishLogin],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const { user, access, refresh } = await signupRequest(input);
      await finishLogin(user, access, refresh);
    },
    [finishLogin],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.status === 'signedIn' ? state.user : null,
      login,
      signup,
      logout: signOutLocally,
    }),
    [state, login, signup, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
