import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { fetchListing, type ListingDetail } from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { FeedMessage } from '@/components/feed-message';
import { ListingForm } from '@/components/listing-form';
import { RequireAuth } from '@/components/require-auth';
import { ThemedView } from '@/components/themed-view';

/** The Sell form, filled in with my listing's current information. */
function EditListingContent({ id }: { id: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notFound' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      setListing(await fetchListing(id, true));
      setState('ready');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? 'notFound' : 'error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === 'loading') return <FeedMessage kind="loading" text={t('home.loading')} />;
  // Only the seller can edit; for anyone else it's as if the listing didn't exist.
  if (state === 'notFound' || (listing && listing.seller.id !== user?.id)) {
    return <FeedMessage kind="message" icon="search-outline" text={t('listing.notFound')} />;
  }
  if (state === 'error' || !listing) {
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
  return (
    <ListingForm
      initial={listing}
      onDone={(listingId) =>
        router.canGoBack() ? router.back() : router.replace(`/listing/${listingId}` as Href)
      }
    />
  );
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth next={`/listing/${id}/edit`}>
      <ThemedView style={{ flex: 1 }}>
        <EditListingContent id={id} />
      </ThemedView>
    </RequireAuth>
  );
}
