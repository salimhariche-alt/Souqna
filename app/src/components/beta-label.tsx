import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAppConfig } from '@/hooks/use-app-config';
import { useTokens } from '@/theme';
import { Badge } from '@/ui';

/** A small "Beta" pill, shown only while the server is in beta mode. */
export function BetaLabel() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { betaMode } = useAppConfig();
  if (!betaMode) return null;
  return (
    <View
      accessible
      accessibilityLabel={t('beta.labelA11y')}
      style={{ marginHorizontal: tk.space.lg }}>
      <Badge label={t('beta.label')} tone="info" icon="flask-outline" />
    </View>
  );
}
