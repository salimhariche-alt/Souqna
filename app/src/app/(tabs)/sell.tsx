import { router, type Href } from 'expo-router';
import { useState } from 'react';

import { ListingForm } from '@/components/listing-form';
import { RequireAuth } from '@/components/require-auth';
import { ThemedView } from '@/components/themed-view';

export default function SellScreen() {
  // A new key gives an empty form again after publishing.
  const [formKey, setFormKey] = useState(0);
  return (
    <RequireAuth next="/sell" verified>
      <ThemedView style={{ flex: 1 }}>
        <ListingForm
          key={formKey}
          onDone={(listingId) => {
            setFormKey((key) => key + 1);
            router.push(`/listing/${listingId}` as Href);
          }}
        />
      </ThemedView>
    </RequireAuth>
  );
}
