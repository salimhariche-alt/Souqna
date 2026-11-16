import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';

/** Longest voice message, in seconds (the server refuses longer ones). */
export const MAX_VOICE_SECONDS = 60;
/** Shorter than this = an accidental tap: nothing is sent. */
export const MIN_VOICE_MS = 700;

/**
 * Small files for slow mobile data: AAC in an .m4a file, mono, 22 kHz, 32 kbit/s.
 * Clear enough for speech; 60 seconds is about 240 KB (the server accepts up to 1 MB).
 */
export const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.LOW },
  // Browsers record WebM, which the server doesn't accept: recording is phone-only.
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

/** 7300 ms -> "0:07" */
export function formatDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
