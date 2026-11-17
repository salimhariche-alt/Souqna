/**
 * Settings the server tells the app (GET /api/auth/config/), e.g. beta mode.
 *
 * Asked once when the app starts and shared by every screen. Until the answer
 * arrives (or if the server can't be reached) beta mode counts as off; the server
 * checks everything again anyway (invite codes, SMS...).
 */
import { useEffect, useState } from 'react';

import { apiFetch } from '@/api/client';

export type AppConfig = { beta_mode: boolean };

const DEFAULT: AppConfig = { beta_mode: false };

let current: AppConfig = DEFAULT;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<(config: AppConfig) => void>();

function load(): Promise<void> {
  loading ??= apiFetch<AppConfig>('/api/auth/config/')
    .then((config) => {
      current = { ...DEFAULT, ...config };
      loaded = true;
      listeners.forEach((listener) => listener(current));
    })
    .catch(() => {
      loading = null; // try again next time a screen asks
    });
  return loading;
}

/** { betaMode, loaded } - re-renders when the server's answer arrives. */
export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>(current);
  useEffect(() => {
    listeners.add(setConfig);
    if (!loaded) load();
    else setConfig(current);
    return () => {
      listeners.delete(setConfig);
    };
  }, []);
  return { betaMode: config.beta_mode, loaded };
}
