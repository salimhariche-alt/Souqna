import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTokens } from '@/theme';
import { AppText, Button, Card } from '@/ui';

type Topic = { key: 'buy' | 'sell' | 'verify' | 'safety'; icon: ComponentProps<typeof Ionicons>['name'] };

const TOPICS: Topic[] = [
  { key: 'buy', icon: 'bag-handle-outline' },
  { key: 'sell', icon: 'add-circle-outline' },
  { key: 'verify', icon: 'shield-checkmark-outline' },
  { key: 'safety', icon: 'flag-outline' },
];

/** Help: short answers to the most common questions. Open to everyone. */
export default function HelpScreen() {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <ScrollView
      style={{ backgroundColor: tk.color.background }}
      contentContainerStyle={[styles.container, { padding: tk.space.lg, gap: tk.space.md, maxWidth: tk.maxWidth }]}>
      <AppText tone="secondary">{t('help.intro')}</AppText>
      {TOPICS.map((topic) => (
        <Card key={topic.key}>
          <View style={[styles.title, { gap: tk.space.md }]}>
            <View style={[styles.icon, { backgroundColor: tk.color.primarySoft }]}>
              <Ionicons name={topic.icon} size={22} color={tk.color.primary} />
            </View>
            <AppText variant="bodyStrong" style={styles.flex}>
              {t(`help.${topic.key}.question`)}
            </AppText>
          </View>
          <AppText tone="secondary">{t(`help.${topic.key}.answer`)}</AppText>
        </Card>
      ))}
      <Button title={t('safety.title')} variant="outlined" icon="shield-checkmark-outline" onPress={() => router.push('/buy-safely' as Href)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'center' },
  title: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
