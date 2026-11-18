import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchBlockedUsers, unblockUser, type BlockedUser } from '@/api/safety';
import { FeedMessage } from '@/components/feed-message';
import { PrimaryButton } from '@/components/primary-button';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n/language-provider';

/** The people I blocked, with an "Unblock" button for each. */
function BlockedUsersContent() {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setUsers(await fetchBlockedUsers());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = async (person: BlockedUser) => {
    setBusyId(person.id);
    setError(undefined);
    try {
      await unblockUser(person.id);
      setUsers((current) => current?.filter((u) => u.id !== person.id) ?? null);
    } catch {
      setError(t('listing.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  if (failed) {
    return (
      <FeedMessage
        kind="message"
        icon="cloud-offline-outline"
        text={t('home.error')}
        buttonLabel={t('home.retry')}
        onPress={load}
      />
    );
  }
  if (!users) return <FeedMessage kind="loading" text={t('home.loading')} />;
  if (!users.length) {
    return <FeedMessage kind="message" icon="happy-outline" text={t('block.empty')} />;
  }

  return (
    <FlatList
      data={users}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={{ textAlign: direction === 'rtl' ? 'right' : 'left' }}>
          {error ?? t('block.listIntro')}
        </ThemedText>
      }
      renderItem={({ item }) => (
        <ThemedView type="backgroundElement" style={styles.row}>
          <View style={styles.avatar}>
            <ThemedText type="smallBold" style={styles.avatarText}>
              {item.display_name.trim().charAt(0).toUpperCase() || '?'}
            </ThemedText>
          </View>
          <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
            {item.display_name}
          </ThemedText>
          <View style={styles.button}>
            <PrimaryButton
              title={t('block.unblock')}
              variant="secondary"
              loading={busyId === item.id}
              onPress={() => unblock(item)}
            />
          </View>
        </ThemedView>
      )}
    />
  );
}

export default function BlockedUsersScreen() {
  return (
    <RequireAuth next="/blocked-users">
      <BlockedUsersContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7A6858',
  },
  avatarText: { color: '#ffffff', fontSize: 16 },
  name: { flex: 1 },
  button: { minWidth: 120 },
});
