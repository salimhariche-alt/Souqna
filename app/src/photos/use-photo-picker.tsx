import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/confirm-dialog';

export type PhotoSource = 'camera' | 'gallery';
type PickedPhoto = { uri: string; width: number };

const getPermission = (source: PhotoSource) =>
  source === 'camera'
    ? ImagePicker.getCameraPermissionsAsync()
    : ImagePicker.getMediaLibraryPermissionsAsync();

const requestPermission = (source: PhotoSource) =>
  source === 'camera'
    ? ImagePicker.requestCameraPermissionsAsync()
    : ImagePicker.requestMediaLibraryPermissionsAsync();

/**
 * Take a photo or choose some from the gallery, asking for permission politely:
 * 1. first our own explanation ("Sougna needs the camera to..."), then the phone's question;
 * 2. if the user refused for good, explain how to allow it in the phone's settings.
 *
 * `pick(source, max)` gives the chosen photos to `onPicked`. Render `dialogs` in the screen.
 */
export function usePhotoPicker(onPicked: (photos: PickedPhoto[]) => void) {
  const { t } = useTranslation();
  const [explain, setExplain] = useState<{ source: PhotoSource; max: number } | null>(null);
  const [settingsFor, setSettingsFor] = useState<PhotoSource | null>(null);

  const launch = async (source: PhotoSource, max: number) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1, // we compress ourselves afterwards (see prepare.ts)
      exif: false,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({
            ...options,
            allowsMultipleSelection: max > 1,
            selectionLimit: max,
            orderedSelection: true,
          });
    if (!result.canceled) {
      onPicked(result.assets.slice(0, max).map((a) => ({ uri: a.uri, width: a.width })));
    }
  };

  const pick = async (source: PhotoSource, max: number) => {
    if (max <= 0) return;
    if (Platform.OS === 'web') return launch(source, max); // the browser asks by itself
    const permission = await getPermission(source);
    if (permission.granted) return launch(source, max);
    if (permission.canAskAgain) return setExplain({ source, max }); // explain, then ask
    setSettingsFor(source); // refused for good: only the phone's settings can change it
  };

  const askNow = async () => {
    if (!explain) return;
    const { source, max } = explain;
    setExplain(null);
    const permission = await requestPermission(source);
    if (permission.granted) await launch(source, max);
    else if (!permission.canAskAgain) setSettingsFor(source);
  };

  const dialogs = (
    <>
      <ConfirmDialog
        visible={explain !== null}
        title={
          explain?.source === 'camera' ? t('sell.cameraAccessTitle') : t('sell.galleryAccessTitle')
        }
        message={
          explain?.source === 'camera' ? t('sell.cameraAccessText') : t('sell.galleryAccessText')
        }
        confirmLabel={t('sell.continue')}
        cancelLabel={t('sell.notNow')}
        onConfirm={askNow}
        onCancel={() => setExplain(null)}
      />
      <ConfirmDialog
        visible={settingsFor !== null}
        title={t('sell.permissionDeniedTitle')}
        message={
          settingsFor === 'camera' ? t('sell.cameraDeniedText') : t('sell.galleryDeniedText')
        }
        confirmLabel={t('sell.openSettings')}
        cancelLabel={t('listing.cancel')}
        onConfirm={() => {
          setSettingsFor(null);
          Linking.openSettings().catch(() => {});
        }}
        onCancel={() => setSettingsFor(null)}
      />
    </>
  );

  return { pick, dialogs };
}
