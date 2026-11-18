import { useEffect, useState } from 'react';
import { useColorScheme as usePhoneColorScheme } from 'react-native';

import { APP_COLOR_MODE } from '@/theme/tokens';

/**
 * Web version of the app's light/dark mode (see use-color-scheme.ts). With 'phone', the
 * browser's setting is only read after the page has started (light until then).
 */
export function useColorScheme(): 'light' | 'dark' {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    setHasHydrated(true);
  }, []);
  const phone = usePhoneColorScheme();
  if (APP_COLOR_MODE !== 'phone') return APP_COLOR_MODE;
  return hasHydrated && phone === 'dark' ? 'dark' : 'light';
}
