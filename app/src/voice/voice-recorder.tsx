import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Linking, PanResponder, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useLanguage } from '@/i18n/language-provider';

import { MAX_VOICE_SECONDS, MIN_VOICE_MS, VOICE_RECORDING } from './recording';

import { Brand } from '@/constants/theme';
/** Slide this far towards the start of the line to cancel. */
const CANCEL_DISTANCE = 80;

export type RecordingState = { elapsedMs: number; cancelling: boolean };

type Props = {
  /** Greyed out: a tap calls onUnavailablePress instead of recording. */
  disabled: boolean;
  onUnavailablePress: () => void;
  /** Checks before recording (e.g. verified phone). Return false to stop. */
  canStart: () => boolean;
  /** The recording to send. */
  onRecorded: (uri: string, durationMs: number) => void;
  /** null when not recording; the chat shows the timer instead of the text box. */
  onStateChange: (state: RecordingState | null) => void;
  /** The press was too short: tell the user to hold the button. */
  onTooShort: () => void;
};

/**
 * WhatsApp-style microphone button: hold to record, release to send,
 * slide away (towards the start of the line) to cancel. Stops by itself at 60 s.
 */
export function VoiceRecorderButton(props: Props) {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const [explain, setExplain] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [active, setActive] = useState(false);

  // The gesture handlers are created once, so they read the latest values from refs.
  const latest = useRef({ props, direction });
  latest.current = { props, direction };
  const state = useRef({
    phase: 'idle' as 'idle' | 'starting' | 'recording',
    released: false,
    cancelling: false,
    startedAt: 0,
    timer: null as ReturnType<typeof setInterval> | null,
    limit: null as ReturnType<typeof setTimeout> | null,
  });

  const clearTimers = () => {
    const s = state.current;
    if (s.timer) clearInterval(s.timer);
    if (s.limit) clearTimeout(s.limit);
    s.timer = null;
    s.limit = null;
  };

  const finish = async (cancel: boolean) => {
    const s = state.current;
    if (s.phase === 'starting') {
      s.released = true; // stop as soon as the recorder has started
      return;
    }
    if (s.phase !== 'recording') return;
    s.phase = 'idle';
    clearTimers();
    setActive(false);
    latest.current.props.onStateChange(null);
    const durationMs = Date.now() - s.startedAt;
    try {
      await recorder.stop();
    } catch {
      // nothing to send
    }
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (cancel || !uri) return;
    if (durationMs < MIN_VOICE_MS) {
      latest.current.props.onTooShort();
      return;
    }
    latest.current.props.onRecorded(uri, Math.min(durationMs, MAX_VOICE_SECONDS * 1000));
  };

  const start = async () => {
    const s = state.current;
    const { props: current } = latest.current;
    if (current.disabled) {
      current.onUnavailablePress();
      return;
    }
    if (!current.canStart() || s.phase !== 'idle') return;

    // Permission: explain first, then the phone asks; if refused for good, settings.
    const permission = await getRecordingPermissionsAsync();
    if (!permission.granted) {
      if (permission.canAskAgain) setExplain(true);
      else setOpenSettings(true);
      return;
    }

    s.phase = 'starting';
    s.released = false;
    s.cancelling = false;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_VOICE_SECONDS });
    } catch {
      s.phase = 'idle';
      return;
    }
    s.phase = 'recording';
    s.startedAt = Date.now();
    setActive(true);
    current.onStateChange({ elapsedMs: 0, cancelling: false });
    s.timer = setInterval(() => {
      latest.current.props.onStateChange({
        elapsedMs: Date.now() - s.startedAt,
        cancelling: s.cancelling,
      });
    }, 200);
    // Stop and send automatically at 60 seconds.
    s.limit = setTimeout(() => finish(false), MAX_VOICE_SECONDS * 1000);
    if (s.released) finish(s.cancelling); // the finger was lifted while starting
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start();
      },
      onPanResponderMove: (_, gesture) => {
        // "Towards the start of the line": left in French/English, right in Arabic.
        const towardsStart = latest.current.direction === 'rtl' ? gesture.dx : -gesture.dx;
        const cancelling = towardsStart > CANCEL_DISTANCE;
        const s = state.current;
        if (cancelling !== s.cancelling) {
          s.cancelling = cancelling;
          if (s.phase === 'recording') {
            latest.current.props.onStateChange({
              elapsedMs: Date.now() - s.startedAt,
              cancelling,
            });
          }
        }
      },
      onPanResponderRelease: () => {
        finish(state.current.cancelling);
      },
      onPanResponderTerminate: () => {
        finish(true);
      },
    }),
  ).current;

  // Leaving the chat while recording: throw the recording away.
  useEffect(() => () => {
    clearTimers();
    if (state.current.phase === 'recording') recorder.stop().catch(() => {});
  }, [recorder]);

  return (
    <>
      <View
        {...responder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('voice.holdToRecord')}
        accessibilityState={{ disabled: props.disabled }}
        style={[
          styles.button,
          props.disabled && styles.disabled,
          active && styles.recording,
        ]}>
        <Ionicons name={active ? 'mic' : 'mic-outline'} size={22} color="#ffffff" />
      </View>

      <ConfirmDialog
        visible={explain}
        title={t('voice.micAccessTitle')}
        message={t('voice.micAccessText')}
        confirmLabel={t('sell.continue')}
        cancelLabel={t('sell.notNow')}
        onConfirm={async () => {
          setExplain(false);
          const result = await requestRecordingPermissionsAsync();
          if (!result.granted && !result.canAskAgain) setOpenSettings(true);
        }}
        onCancel={() => setExplain(false)}
      />
      <ConfirmDialog
        visible={openSettings}
        title={t('sell.permissionDeniedTitle')}
        message={t('voice.micDeniedText')}
        confirmLabel={t('sell.openSettings')}
        cancelLabel={t('listing.cancel')}
        onConfirm={() => {
          setOpenSettings(false);
          Linking.openSettings().catch(() => {});
        }}
        onCancel={() => setOpenSettings(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.fill,
  },
  disabled: { backgroundColor: '#9AA0A6' },
  recording: { backgroundColor: '#D93025', transform: [{ scale: 1.15 }] },
});
