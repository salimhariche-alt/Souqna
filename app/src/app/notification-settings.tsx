import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RequireAuth } from '@/components/require-auth';
import {
  fetchPushSettings,
  pushPermission,
  pushSupport,
  registerForPush,
  updatePushSettings,
  type PushPermission,
  type PushSettings,
} from '@/push/push';
import { useTokens } from '@/theme';
import { AppText, Button, SectionHeader } from '@/ui';

/**
 * Profile -> Notifications: what this phone may show (the phone's permission), and the
 * two kinds of alerts - orders & deliveries, messages & offers - each can be turned off.
 */
function SettingsContent() {
  const { t } = useTranslation();
  const tk = useTokens();
  const support = pushSupport();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [error, setError] = useState<string>();
  const [asking, setAsking] = useState(false);

  // Again when coming back from the phone's settings.
  useFocusEffect(
    useCallback(() => {
      pushPermission().then(setPermission).catch(() => setPermission('undetermined'));
      fetchPushSettings()
        .then(setSettings)
        .catch(() => setError(t('listing.actionFailed')));
    }, [t]),
  );

  const change = async (key: keyof PushSettings, value: boolean) => {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, [key]: value }); // show it straight away
    setError(undefined);
    try {
      setSettings(await updatePushSettings({ [key]: value }));
    } catch {
      setSettings(before);
      setError(t('listing.actionFailed'));
    }
  };

  const allow = async () => {
    setAsking(true);
    try {
      setPermission(await registerForPush(true));
    } catch {
      setError(t('push.failed'));
    } finally {
      setAsking(false);
    }
  };

  const phoneNote =
    support === 'expo-go'
      ? t('push.expoGo')
      : support !== 'ok'
        ? t('push.unsupported')
        : permission === 'granted'
          ? t('push.allowed')
          : permission === 'denied'
            ? t('push.denied')
            : t('push.notYet');

  return (
    <ScrollView style={{ backgroundColor: tk.color.background }} contentContainerStyle={styles.page}>
      {/* This phone */}
      <View style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
        <AppText variant="bodyStrong">{t('push.thisPhone')}</AppText>
        <AppText variant="small" tone={permission === 'granted' && support === 'ok' ? 'success' : 'secondary'}>
          {phoneNote}
        </AppText>
        {support === 'ok' && permission === 'undetermined' ? (
          <Button title={t('push.allow')} icon="notifications-outline" size="sm" onPress={allow} loading={asking} />
        ) : null}
        {support === 'ok' && permission === 'denied' ? (
          <Button
            title={t('push.openSettings')}
            icon="settings-outline"
            size="sm"
            variant="outlined"
            onPress={() => Linking.openSettings()}
          />
        ) : null}
      </View>

      {/* What to receive */}
      <View style={{ gap: 8 }}>
        <SectionHeader title={t('push.whatTitle')} subtitle={t('push.whatHint')} />
        <View style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border, gap: 0 }]}>
          <SettingRow
            label={t('push.orders')}
            hint={t('push.ordersHint')}
            value={settings?.orders ?? true}
            disabled={!settings}
            onChange={(value) => change('orders', value)}
          />
          <View style={[styles.divider, { backgroundColor: tk.color.divider }]} />
          <SettingRow
            label={t('push.messages')}
            hint={t('push.messagesHint')}
            value={settings?.messages ?? true}
            disabled={!settings}
            onChange={(value) => change('messages', value)}
          />
        </View>
        <AppText variant="caption" tone="secondary">
          {t('push.privacy')}
        </AppText>
      </View>
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </ScrollView>
  );
}

function SettingRow({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const tk = useTokens();
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption" tone="secondary">
          {hint}
        </AppText>
      </View>
      {/* On the website the switch needs its own knob colour, and is drawn wrongly
          right-to-left: keep it left-to-right there (phones use the system switch). */}
      <View style={Platform.OS === 'web' ? styles.ltr : undefined}>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={label}
          trackColor={{ false: tk.color.iconMuted, true: tk.color.primary }}
          thumbColor={tk.brand.white}
          ios_backgroundColor={tk.color.iconMuted}
          {...(Platform.OS === 'web' ? { activeThumbColor: tk.brand.white } : {})}
        />
      </View>
    </View>
  );
}

export default function NotificationSettingsScreen() {
  return (
    <RequireAuth next="/notification-settings">
      <SettingsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  page: { padding: 20, gap: 20, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  divider: { height: 1, marginVertical: 4 },
  ltr: { direction: 'ltr' },
});
