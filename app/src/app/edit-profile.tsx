import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { removeAvatarRequest, updateProfileRequest, uploadAvatarRequest } from '@/api/auth';
import { useAuth } from '@/auth/auth-provider';
import { Avatar } from '@/components/avatar';
import { FormField } from '@/components/form-field';
import { OptionsMenu, type MenuOption } from '@/components/options-menu';
import { PrimaryButton } from '@/components/primary-button';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WilayaPicker } from '@/components/wilaya-picker';
import { Brand, Spacing } from '@/constants/theme';
import { formErrorsFrom } from '@/i18n/api-errors';
import { preparePhoto } from '@/photos/prepare';
import { usePhotoPicker } from '@/photos/use-photo-picker';

/** Profile photos are shown small: 800 px is plenty (the server makes them 600 x 600). */
const AVATAR_WIDTH = 800;

function EditProfileContent() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.display_name ?? '');
  const [wilaya, setWilaya] = useState<number | null>(user?.wilaya ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);

  const { pick, dialogs } = usePhotoPicker(async ([photo]) => {
    if (!photo) return;
    setPhotoBusy(true);
    setGeneral(undefined);
    try {
      const ready = await preparePhoto(photo, AVATAR_WIDTH);
      const { user: updated } = await uploadAvatarRequest(ready.uri);
      await updateUser(updated);
    } catch (error) {
      setGeneral(formErrorsFrom(error, t).general ?? t('errors.unknown'));
    } finally {
      setPhotoBusy(false);
    }
  });

  if (!user) return null;

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      const { user: updated } = await removeAvatarRequest();
      await updateUser(updated);
    } catch {
      setGeneral(t('listing.actionFailed'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const photoOptions: MenuOption[] = [
    { label: t('sell.camera'), icon: 'camera-outline', onPress: () => pick('camera', 1) },
    { label: t('sell.gallery'), icon: 'images-outline', onPress: () => pick('gallery', 1) },
    ...(user.avatar
      ? [{ label: t('profile.removePhoto'), icon: 'trash-outline' as const, onPress: removePhoto, danger: true }]
      : []),
  ];

  const save = async () => {
    const found: Record<string, string> = {};
    if (!name.trim()) found.display_name = t('errors.nameRequired');
    if (wilaya === null) found.wilaya = t('errors.wilayaRequired');
    setErrors(found);
    setGeneral(undefined);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const updated = await updateProfileRequest({ display_name: name.trim(), wilaya: wilaya! });
      await updateUser(updated);
      router.back();
    } catch (error) {
      const result = formErrorsFrom(error, t, { display_name: 'display_name', wilaya: 'wilaya' });
      setErrors(result.fields);
      setGeneral(result.general);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => setPhotoMenu(true)}
          disabled={photoBusy}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhoto')}
          style={styles.photo}>
          <Avatar uri={user.avatar} name={user.display_name} size={112} />
          <View style={styles.cameraBadge}>
            {photoBusy ? <ActivityIndicator color="#ffffff" /> : <Ionicons name="camera" size={18} color="#ffffff" />}
          </View>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {t('profile.photoHint')}
        </ThemedText>

        <FormField
          label={t('auth.displayName')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setErrors((e) => ({ ...e, display_name: '' }));
          }}
          maxLength={50}
          error={errors.display_name || undefined}
        />
        <WilayaPicker label={t('auth.wilaya')} value={wilaya} onChange={setWilaya} error={errors.wilaya || undefined} />

        {general ? (
          <ThemedText themeColor="danger" type="small" style={styles.error}>
            {general}
          </ThemedText>
        ) : null}
        <PrimaryButton title={t('profile.save')} onPress={save} loading={saving} />
      </ScrollView>
      <OptionsMenu visible={photoMenu} options={photoOptions} onClose={() => setPhotoMenu(false)} />
      {dialogs}
    </KeyboardAvoidingView>
  );
}

export default function EditProfileScreen() {
  return (
    <RequireAuth next="/edit-profile">
      <ThemedView style={styles.flex}>
        <EditProfileContent />
      </ThemedView>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  container: { padding: Spacing.four, gap: Spacing.four, width: '100%', maxWidth: 480, alignSelf: 'center' },
  photo: { alignSelf: 'center' },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.fill,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  error: {},
});
