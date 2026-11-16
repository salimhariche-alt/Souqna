import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useNavigation, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ListingForm } from '@/components/listing-form';
import { RequireAuth } from '@/components/require-auth';
import { ThemedView } from '@/components/themed-view';
import { useTokens } from '@/theme';

export default function SellScreen() {
  const { t } = useTranslation();
  const tk = useTokens();
  const navigation = useNavigation();
  // A new key gives an empty form again after publishing.
  const [formKey, setFormKey] = useState(0);

  // An ✕ at the top to close the form (back to Home; what was typed is kept).
  useEffect(() => {
    navigation.setOptions({
      title: t('sell.screenTitle'),
      headerLeft: () => (
        <Pressable
          onPress={() => router.navigate('/')}
          accessibilityRole="button"
          accessibilityLabel={t('auth.close')}
          hitSlop={10}
          style={{ paddingHorizontal: tk.space.lg }}>
          <Ionicons name="close" size={26} color={tk.color.text} />
        </Pressable>
      ),
    });
  }, [navigation, t, tk.color.text, tk.space.lg]);

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
