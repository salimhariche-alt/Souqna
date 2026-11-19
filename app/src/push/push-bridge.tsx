import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';

import { pushPermission, pushSupport, registerForPush } from './push';

const ASKED_KEY = 'souqna.pushAsked';

// Alerts that arrive while the app is open are shown too (as a banner).
if (pushSupport() === 'ok') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Lives once in the app (root layout):
 * - logged in and permission already given: tells the server this phone's address;
 * - never asked on this phone: explains why first (our dialog), then the phone asks;
 * - tapping an alert opens its order or chat (also when the app was closed).
 */
export function PushBridge() {
  // Website / Expo Go on Android: no push notifications, nothing to do.
  return pushSupport() === 'ok' ? <PushBridgeOnPhone /> : null;
}

function PushBridgeOnPhone() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const [explain, setExplain] = useState(false);
  const lastHandled = useRef<string | null>(null);
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (status !== 'signedIn') return;
    (async () => {
      const permission = await pushPermission();
      if (permission === 'granted') {
        registerForPush(false).catch(() => {});
      } else if (permission === 'undetermined' && (await AsyncStorage.getItem(ASKED_KEY)) !== '1') {
        setExplain(true);
      }
    })();
  }, [status]);

  // Tapped an alert: go to its page.
  useEffect(() => {
    const id = response?.notification.request.identifier;
    const url = response?.notification.request.content.data?.url;
    if (!id || id === lastHandled.current || typeof url !== 'string' || !url.startsWith('/')) return;
    lastHandled.current = id;
    router.push(url as Href);
  }, [response]);

  const done = (allow: boolean) => {
    setExplain(false);
    AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
    if (allow) registerForPush(true).catch(() => {});
  };

  return (
    <ConfirmDialog
      visible={explain}
      title={t('push.askTitle')}
      message={t('push.askText')}
      confirmLabel={t('push.allow')}
      cancelLabel={t('push.later')}
      onConfirm={() => done(true)}
      onCancel={() => done(false)}
    />
  );
}
