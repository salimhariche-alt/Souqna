import { useColorScheme as usePhoneColorScheme } from 'react-native';

import { APP_COLOR_MODE } from '@/theme/tokens';

/**
 * The app's light/dark mode: APP_COLOR_MODE in src/theme/tokens.ts ('light' by default,
 * even when the phone is in dark mode), or the phone's own setting with 'phone'.
 */
export function useColorScheme(): 'light' | 'dark' {
  const phone = usePhoneColorScheme();
  if (APP_COLOR_MODE !== 'phone') return APP_COLOR_MODE;
  return phone === 'dark' ? 'dark' : 'light';
}
