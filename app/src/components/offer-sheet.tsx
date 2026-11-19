import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { discountPercent, minOffer } from '@/api/offers';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, Button, Chip, TextField } from '@/ui';
import { onlyDigits } from '@/utils/digits';
import { formatPrice } from '@/utils/format';

type Props = {
  visible: boolean;
  /** The listing's price. */
  price: number;
  sending: boolean;
  error?: string;
  onSend: (amount: number) => void;
  onCancel: () => void;
};

/** Quick choices: 5, 10 and 15 % off (rounded to 10 DA). */
const QUICK = [5, 10, 15];

/**
 * "Faire une offre": slides up from the bottom of the chat - the listed price, the
 * amount (quick choices -5 / -10 / -15 %), the minimum (half the price) and a reminder
 * that an accepted offer is valid 48 hours for this buyer only.
 */
export function OfferSheet({ visible, price, sending, error, onSend, onCancel }: Props) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language, direction } = useLanguage();
  const [amount, setAmount] = useState('');
  const [localError, setLocalError] = useState<string>();
  const min = minOffer(price);
  const quick = QUICK.map((percent) => Math.max(min, Math.round((price * (100 - percent)) / 100 / 10) * 10));

  const send = () => {
    const value = Number(amount);
    if (!value) return setLocalError(t('offers.errors.amountRequired'));
    if (value >= price) return setLocalError(t('offers.errors.tooHigh'));
    if (value < min) return setLocalError(t('offers.errors.tooLow', { min: formatPrice(min, language) }));
    setLocalError(undefined);
    onSend(value);
  };

  const value = Number(amount);
  const serif = language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      onShow={() => {
        setAmount('');
        setLocalError(undefined);
      }}>
      <KeyboardAvoidingView
        style={[styles.backdrop, { direction, backgroundColor: tk.color.overlay }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.flex} onPress={onCancel} accessibilityLabel={t('offers.cancel')} />
        <View style={[styles.sheet, { backgroundColor: tk.color.background }]}>
          <SafeAreaView edges={['bottom']} style={styles.content}>
            <View style={{ gap: 2 }}>
              <Text style={[styles.title, { color: tk.color.text, fontFamily: serif }]} accessibilityRole="header">
                {t('offers.sheetTitle')}
              </Text>
              <AppText variant="small" tone="secondary">
                {t('offers.listPrice', { price: formatPrice(price, language) })}
              </AppText>
            </View>
            <View style={styles.chips}>
              {quick.map((suggestion, i) => (
                <Chip
                  key={QUICK[i]}
                  label={`${formatPrice(suggestion, language)} (−${QUICK[i]} %)`}
                  selected={value === suggestion}
                  onPress={() => {
                    setAmount(String(suggestion));
                    setLocalError(undefined);
                  }}
                />
              ))}
            </View>
            <TextField
              label={t('offers.amountLabel')}
              icon="cash-outline"
              value={amount}
              onChangeText={(text) => {
                setAmount(onlyDigits(text).slice(0, 9));
                setLocalError(undefined);
              }}
              placeholder={String(quick[1])}
              keyboardType="number-pad"
              inputMode="numeric"
              hint={
                value > 0 && value < price
                  ? `${t('offers.min', { min: formatPrice(min, language) })} · ${t('offers.discount', { percent: discountPercent(value, price) })}`
                  : t('offers.min', { min: formatPrice(min, language) })
              }
              error={localError ?? error}
            />
            <AppText variant="small" tone="secondary">
              {t('offers.hint')}
            </AppText>
            <Button title={t('offers.send')} icon="pricetag-outline" onPress={send} loading={sending} />
            <Button title={t('offers.cancel')} variant="outlined" onPress={onCancel} disabled={sending} />
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  content: { padding: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 22, lineHeight: 28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
