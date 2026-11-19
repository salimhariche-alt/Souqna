import * as Location from 'expo-location';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { sortByDistance, type RelayPoint } from '@/api/delivery';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RelayMap } from '@/components/relay-map';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { AppText, Button, DesignIcon } from '@/ui';

type LocationState = 'off' | 'asking' | 'on' | 'denied' | 'failed';

type Props = {
  /** null while loading. */
  points: RelayPoint[] | null;
  failed: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  error?: string;
};

/**
 * Choosing a courier's office: "Bureaux les plus proches de moi" (explained first, then
 * the phone asks; approximate location, sorted on the phone and never sent), a small
 * OpenStreetMap map and the list (address, hours, distance). Used by the buyer's
 * "Commander" (pick-up office) and the seller's "Confirmer la vente" (drop-off office).
 */
export function RelayPicker({ points, failed, selected, onSelect, error }: Props) {
  const { t } = useTranslation();
  const tk = useTokens();
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locationState, setLocationState] = useState<LocationState>('off');

  const sorted = useMemo(() => {
    if (!points) return null;
    if (!me) return points.map((point) => ({ point, km: null as number | null }));
    return sortByDistance(points, me.lat, me.lng);
  }, [points, me]);

  const findMe = async () => {
    setLocationState('off');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationState('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      setMe({ lat: position.coords.latitude, lng: position.coords.longitude });
      setLocationState('on');
    } catch {
      setLocationState('failed');
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {points && points.length > 1 ? (
        locationState === 'on' ? (
          <View style={styles.row}>
            <DesignIcon name="pin" size={16} color={tk.color.success} strokeWidth={1.9} />
            <AppText variant="small" tone="success">
              {t('delivery.locationOn')}
            </AppText>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Button
              title={t('delivery.useLocation')}
              icon="navigate-outline"
              variant="outlined"
              size="sm"
              onPress={() => setLocationState('asking')}
            />
            {locationState === 'denied' || locationState === 'failed' ? (
              <AppText variant="small" tone="secondary">
                {locationState === 'denied' ? t('delivery.locationDenied') : t('delivery.locationFailed')}
              </AppText>
            ) : null}
          </View>
        )
      ) : null}

      {failed ? (
        <AppText variant="small" tone="danger">
          {t('delivery.relayError')}
        </AppText>
      ) : !sorted ? (
        <View style={styles.row}>
          <ActivityIndicator color={tk.color.primary} />
          <AppText tone="secondary">{t('delivery.relayLoading')}</AppText>
        </View>
      ) : sorted.length === 0 ? (
        <View style={[styles.note, { backgroundColor: tk.color.warningSoft }]}>
          <AppText variant="small" tone="warning" style={styles.flex}>
            {t('delivery.noRelay')}
          </AppText>
        </View>
      ) : (
        <>
          <RelayMap
            points={points ?? []}
            selected={selected}
            onSelect={onSelect}
            me={me}
            accessibilityLabel={t('delivery.mapA11y')}
          />
          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {sorted.map(({ point, km }) => (
              <RelayPointCard
                key={point.id}
                point={point}
                km={km}
                selected={selected === point.id}
                onPress={() => onSelect(point.id)}
              />
            ))}
          </View>
        </>
      )}
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}

      <ConfirmDialog
        visible={locationState === 'asking'}
        title={t('delivery.locationAskTitle')}
        message={t('delivery.locationAskText')}
        confirmLabel={t('delivery.locationAllow')}
        cancelLabel={t('delivery.locationNo')}
        onConfirm={findMe}
        onCancel={() => setLocationState('off')}
      />
    </View>
  );
}

/** "Sam–jeu · 08:30–18:00" in the user's language. */
export function useOpeningHours() {
  const { t } = useTranslation();
  return (point: Pick<RelayPoint, 'open_days' | 'opens' | 'closes'>) => {
    const days = [...point.open_days].sort((a, b) => a - b);
    const times = { opens: point.opens, closes: point.closes };
    if (days.length === 7) return t('delivery.hoursEveryDay', times);
    if (days.join() === '0,1,2,3,5,6') return t('delivery.hoursDays', { ...times, days: t('delivery.satToThu') });
    return t('delivery.hoursDays', { ...times, days: days.map((d) => t(`delivery.weekdays.d${d}`)).join(', ') });
  };
}

function RelayPointCard({
  point,
  km,
  selected,
  onPress,
}: {
  point: RelayPoint;
  km: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const hours = useOpeningHours();
  const commune = language === 'ar' ? point.commune.name_ar : point.commune.name_fr;
  const distance = km === null ? '' : t('delivery.km', { km: km < 10 ? km.toFixed(1) : Math.round(km) });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={[point.name, point.address, commune, hours(point), distance].filter(Boolean).join('. ')}
      style={({ pressed }) => [
        styles.point,
        {
          backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface,
          borderColor: selected ? tk.color.primary : tk.color.border,
          borderWidth: selected ? 2 : 1,
          padding: selected ? 11 : 12,
        },
      ]}>
      <View style={[styles.radio, { borderColor: selected ? tk.color.primary : tk.color.iconMuted }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: tk.color.primary }]} /> : null}
      </View>
      <View style={[styles.flex, { gap: 2 }]}>
        <AppText variant="bodyStrong">{point.name}</AppText>
        <AppText variant="small" tone="secondary">
          {point.address} · {commune}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {hours(point)}
        </AppText>
      </View>
      {distance ? (
        <AppText variant="smallStrong" style={styles.km}>
          {distance}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, alignItems: 'flex-start' },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  km: { marginTop: 2 },
});
