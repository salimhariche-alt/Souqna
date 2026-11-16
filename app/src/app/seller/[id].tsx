import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchPublicProfile, type PublicProfile } from '@/api/auth';
import { ApiError } from '@/api/client';
import { blockUser } from '@/api/safety';
import { useAuth } from '@/auth/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeedMessage } from '@/components/feed-message';
import { ListingGrid } from '@/components/listing-grid';
import { MoreButton, OptionsMenu } from '@/components/options-menu';
import { ProfileHeader } from '@/components/profile-header';
import { ReportSheet } from '@/components/report-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useListingsFeed } from '@/hooks/use-listings-feed';

/** A seller's public profile: photo, name, wilaya, trust info and active listings.
 * Never their phone number or email (the server doesn't even send them). */
export default function SellerScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notFound' | 'error'>('loading');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const filters = useMemo(() => ({ seller: Number(id) }), [id]);
  const feed = useListingsFeed(filters);
  const isMe = user?.id === Number(id);
  const signedIn = status === 'signedIn';

  const load = useCallback(async () => {
    setState('loading');
    try {
      setProfile(await fetchPublicProfile(id));
      setState('ready');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? 'notFound' : 'error');
    }
  }, [id]);

  useEffect(() => {
    if (status !== 'loading') load();
  }, [load, status]);

  const needsLogin = () => {
    if (signedIn) return false;
    router.push({ pathname: '/login', params: { next: `/seller/${id}` } } as Href);
    return true;
  };

  const block = async () => {
    setBlocking(true);
    try {
      await blockUser(Number(id));
      setConfirmBlock(false);
      setBlocked(true);
    } finally {
      setBlocking(false);
    }
  };

  if (state === 'loading') return <FeedMessage kind="loading" text={t('home.loading')} />;
  if (state === 'notFound') {
    return <FeedMessage kind="message" icon="person-outline" text={t('seller.notFound')} />;
  }
  if (state === 'error' || !profile) {
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
  if (blocked) {
    return (
      <FeedMessage
        kind="message"
        icon="ban-outline"
        text={t('block.done', { name: profile.display_name })}
        buttonLabel={t('block.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          title: profile.display_name,
          headerRight: isMe ? undefined : () => <MoreButton onPress={() => setMenuOpen(true)} />,
        }}
      />
      <ListingGrid
        feed={feed}
        headerComponent={
          <View>
            <ProfileHeader
              name={profile.display_name}
              avatar={profile.avatar}
              wilaya={profile.wilaya}
              phoneVerified={profile.phone_verified}
              memberSince={profile.member_since}
              itemsSold={profile.items_sold}
            />
            <ThemedText type="smallBold" style={styles.section}>
              {t('seller.activeListings', { count: profile.active_listings })}
            </ThemedText>
          </View>
        }
        emptyComponent={
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            {t('seller.noListings')}
          </ThemedText>
        }
      />

      <OptionsMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={[
          {
            label: t('report.reportSeller'),
            icon: 'flag-outline',
            onPress: () => !needsLogin() && setReporting(true),
          },
          {
            label: t('block.blockSeller'),
            icon: 'ban-outline',
            onPress: () => !needsLogin() && setConfirmBlock(true),
            danger: true,
          },
        ]}
      />
      <ReportSheet
        target={reporting ? { type: 'user', id: profile.id } : null}
        onClose={() => setReporting(false)}
      />
      <ConfirmDialog
        visible={confirmBlock}
        title={t('block.confirmTitle', { name: profile.display_name })}
        message={t('block.confirmMessage')}
        confirmLabel={t('block.confirm')}
        cancelLabel={t('listing.cancel')}
        onConfirm={block}
        onCancel={() => setConfirmBlock(false)}
        loading={blocking}
        danger
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.two },
  empty: { textAlign: 'center', padding: Spacing.four },
});
