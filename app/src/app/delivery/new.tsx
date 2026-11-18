import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchConversation, type ConversationDetail } from '@/api/conversations';
import {
  createOrder,
  fetchCommunes,
  fetchQuote,
  type Commune,
  type DeliveryMode,
  type Quote,
} from '@/api/delivery';
import { FeedMessage } from '@/components/feed-message';
import { AmountRows } from '@/components/order-parts';
import { RequireAuth } from '@/components/require-auth';
import { WilayaPicker } from '@/components/wilaya-picker';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import {
  AppText,
  ArchFrame,
  Button,
  ChoiceSheet,
  DesignIcon,
  type DesignIconName,
  ListGroup,
  ListRow,
  SectionHeader,
  TextField,
} from '@/ui';
import { formatPrice } from '@/utils/format';

/**
 * "Envoyer par livraison" (the seller, from the chat): home or stop-desk, the buyer's
 * wilaya, commune, address, name and phone, a live price estimate from the delivery
 * company, then "Confirmer l'envoi". Cash on delivery: no money goes through Sougna.
 */
function DeliveryForm({ conversationId }: { conversationId: number }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<DeliveryMode>('home');
  const [wilaya, setWilaya] = useState<number | null>(null);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [commune, setCommune] = useState<Commune | null>(null);
  const [communeSheet, setCommuneSheet] = useState(false);
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchConversation(conversationId)
      .then((data) => {
        setConversation(data);
        setName((current) => current || data.buyer.display_name);
      })
      .catch(() => setLoadFailed(true));
  }, [conversationId]);

  // The communes of the chosen wilaya.
  useEffect(() => {
    setCommune(null);
    setCommunes([]);
    if (wilaya) fetchCommunes(wilaya).then(setCommunes).catch(() => setCommunes([]));
  }, [wilaya]);

  // A fresh estimate whenever the mode, wilaya or commune changes.
  useEffect(() => {
    if (!wilaya || !commune) {
      setQuote(null);
      return;
    }
    let current = true;
    setQuoting(true);
    fetchQuote(conversationId, mode, wilaya, commune.code)
      .then((q) => current && setQuote(q))
      .catch(() => current && setQuote(null))
      .finally(() => current && setQuoting(false));
    return () => {
      current = false;
    };
  }, [conversationId, mode, wilaya, commune]);

  if (loadFailed) {
    return <FeedMessage kind="message" icon="cloud-offline-outline" text={t('home.error')} />;
  }
  if (!conversation) return <FeedMessage kind="loading" text={t('home.loading')} />;

  const communeName = (c: Commune) => (language === 'ar' ? c.name_ar : `${c.name_fr} · ${c.name_ar}`);

  const send = async () => {
    const found: Record<string, string> = {};
    if (!wilaya) found.wilaya = t('errors.wilayaRequired');
    if (!commune) found.commune = t('delivery.errors.communeRequired');
    if (mode === 'home' && address.trim().length < 5) found.address = t('delivery.errors.addressRequired');
    if (!name.trim()) found.recipient_name = t('delivery.errors.nameRequired');
    if (!phone.trim()) found.recipient_phone = t('errors.phoneInvalid');
    setErrors(found);
    setGeneral(undefined);
    if (Object.keys(found).length || !wilaya || !commune) return;
    setSending(true);
    try {
      const order = await createOrder({
        conversation: conversationId,
        mode,
        wilaya,
        commune: commune.code,
        address: address.trim(),
        recipient_name: name.trim(),
        recipient_phone: phone.trim(),
      });
      router.replace(`/order/${order.id}` as Href);
    } catch (error) {
      const result = formErrorsFrom(error, t, {
        wilaya: 'wilaya',
        commune: 'commune',
        address: 'address',
        recipient_name: 'recipient_name',
        recipient_phone: 'recipient_phone',
      });
      setErrors(result.fields);
      setGeneral(result.general);
    } finally {
      setSending(false);
    }
  };

  const listing = conversation.listing;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: tk.color.background }}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled">
        {/* The item */}
        <View style={[styles.card, styles.itemRow, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
          <ArchFrame width={52} height={58} color={tk.color.tint1} bottomRadius={10}>
            {listing.cover_photo ? (
              <Image source={{ uri: listing.cover_photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : null}
          </ArchFrame>
          <View style={styles.flex}>
            <AppText variant="bodyStrong" numberOfLines={2}>
              {listing.title}
            </AppText>
            <Text style={[styles.price, { color: tk.color.primary, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold }]}>
              {formatPrice(listing.price_dzd, language)}
            </Text>
          </View>
        </View>

        {/* Home or stop-desk */}
        <View style={styles.section}>
          <SectionHeader title={t('delivery.modeTitle')} />
          <View style={styles.modes}>
            <ModeCard
              icon="home"
              title={t('delivery.modeHome')}
              hint={t('delivery.modeHomeHint')}
              selected={mode === 'home'}
              onPress={() => setMode('home')}
            />
            <ModeCard
              icon="box"
              title={t('delivery.modeStopDesk')}
              hint={t('delivery.modeStopDeskHint')}
              selected={mode === 'stop_desk'}
              onPress={() => setMode('stop_desk')}
            />
          </View>
        </View>

        {/* The buyer */}
        <View style={styles.section}>
          <SectionHeader title={t('delivery.buyerTitle')} subtitle={t('delivery.buyerHint')} />
          <WilayaPicker label={t('delivery.wilaya')} value={wilaya} onChange={setWilaya} error={errors.wilaya} />
          <View style={{ gap: 6 }}>
            <AppText variant="smallStrong">{t('delivery.commune')}</AppText>
            <ListGroup>
              <ListRow
                designIcon="pin"
                tint="tint2"
                label={commune ? communeName(commune) : wilaya ? t('delivery.chooseCommune') : t('delivery.chooseWilayaFirst')}
                onPress={wilaya && communes.length ? () => setCommuneSheet(true) : undefined}
                arrow={!!wilaya}
              />
            </ListGroup>
            {errors.commune ? (
              <AppText variant="small" tone="danger">
                {errors.commune}
              </AppText>
            ) : null}
          </View>
          {mode === 'home' && (
            <TextField
              label={t('delivery.address')}
              placeholder={t('delivery.addressPlaceholder')}
              value={address}
              onChangeText={setAddress}
              error={errors.address}
              maxLength={300}
              multiline
            />
          )}
          <TextField
            label={t('delivery.recipientName')}
            value={name}
            onChangeText={setName}
            error={errors.recipient_name}
            maxLength={80}
          />
          <TextField
            label={t('delivery.recipientPhone')}
            placeholder="06 12 34 56 78"
            value={phone}
            onChangeText={setPhone}
            error={errors.recipient_phone}
            keyboardType="phone-pad"
            maxLength={20}
          />
        </View>

        {/* The estimate */}
        <View style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border, gap: 12 }]}>
          <AppText variant="subtitle" style={styles.cardTitle}>
            {t('delivery.estimateTitle')}
          </AppText>
          {quoting ? (
            <View style={[styles.itemRow, { gap: 8 }]}>
              <ActivityIndicator color={tk.color.primary} />
              <AppText tone="secondary">{t('delivery.estimateLoading')}</AppText>
            </View>
          ) : quote ? (
            <>
              <AmountRows
                item={quote.item_price_dzd}
                delivery={quote.delivery_price_dzd}
                fee={quote.buyer_fee_dzd}
                total={quote.total_dzd}
              />
              <AppText variant="small" tone="secondary">
                {t('delivery.days', { min: quote.days_min, max: quote.days_max })} · {t('delivery.provider', { name: quote.provider })}
              </AppText>
              {mode === 'stop_desk' && quote.stop_desk_name ? (
                <AppText variant="small" tone="secondary">
                  {t('delivery.stopDesk', { name: quote.stop_desk_name })}
                </AppText>
              ) : null}
            </>
          ) : (
            <AppText tone="secondary">{t('delivery.estimateChoose')}</AppText>
          )}
        </View>

        <View style={[styles.note, { backgroundColor: tk.color.infoSoft }]}>
          <DesignIcon name="truck" size={20} color={tk.color.info} strokeWidth={1.7} />
          <AppText variant="small" style={[styles.flex, { color: tk.color.info }]}>
            {t('delivery.codNote')}
          </AppText>
        </View>

        {general ? (
          <AppText variant="small" tone="danger">
            {general}
          </AppText>
        ) : null}
        <Button title={t('delivery.confirm')} icon="send" onPress={send} loading={sending} />
      </ScrollView>

      <ChoiceSheet<number>
        visible={communeSheet}
        title={t('delivery.chooseCommune')}
        groups={[{ options: communes.map((c) => ({ value: c.code, label: communeName(c) })) }]}
        selected={commune?.code ?? null}
        onSelect={(code) => {
          setCommune(communes.find((c) => c.code === code) ?? null);
          setCommuneSheet(false);
        }}
        onClose={() => setCommuneSheet(false)}
      />
    </KeyboardAvoidingView>
  );
}

/** A big choice card: home delivery or stop-desk (terracotta border when chosen). */
function ModeCard({
  icon,
  title,
  hint,
  selected,
  onPress,
}: {
  icon: DesignIconName;
  title: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  const tk = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${hint}`}
      style={[
        styles.mode,
        {
          backgroundColor: tk.color.surface,
          borderColor: selected ? tk.color.primary : tk.color.border,
          borderWidth: selected ? 2 : 1,
        },
      ]}>
      <ArchFrame width={40} height={44} color={selected ? tk.color.primary : tk.color.tint3} bottomRadius={8}>
        <View style={styles.center}>
          <DesignIcon name={icon} size={20} color={selected ? tk.brand.white : tk.brand.ink} strokeWidth={1.7} />
        </View>
      </ArchFrame>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="caption" tone="secondary">
        {hint}
      </AppText>
    </Pressable>
  );
}

export default function NewDeliveryScreen() {
  const { t } = useTranslation();
  const { conversation } = useLocalSearchParams<{ conversation?: string }>();
  const id = Number(conversation);
  return (
    <RequireAuth next={`/delivery/new?conversation=${conversation ?? ''}`} verified>
      {Number.isInteger(id) && id > 0 ? (
        <DeliveryForm conversationId={id} />
      ) : (
        <FeedMessage kind="message" icon="search-outline" text={t('listing.notFound')} />
      )}
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  page: { padding: 20, gap: 20, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  section: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16 },
  cardTitle: { fontSize: 18, lineHeight: 24 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  price: { fontSize: 17, lineHeight: 22 },
  modes: { flexDirection: 'row', gap: 12 },
  mode: { flex: 1, borderRadius: 20, padding: 14, gap: 6 },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, alignItems: 'flex-start' },
});
