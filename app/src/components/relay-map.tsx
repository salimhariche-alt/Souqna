import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { RelayPoint } from '@/api/delivery';
import { useTokens } from '@/theme';

import { relayMapHtml } from './relay-map-html';

export type RelayMapProps = {
  points: RelayPoint[];
  selected: string | null;
  onSelect: (id: string) => void;
  me: { lat: number; lng: number } | null;
  accessibilityLabel: string;
};

/** Phones: the OpenStreetMap map in a WebView (relay-map.web.tsx for the website). */
export function RelayMap({ points, selected, onSelect, me, accessibilityLabel }: RelayMapProps) {
  const tk = useTokens();
  // WebView<object>: its default type parameter (undefined) makes every prop `never`.
  const view = useRef<WebView<object>>(null);
  // Built once per list of points (choosing a point doesn't reload the map).
  const html = useMemo(
    () =>
      relayMapHtml({
        points,
        selected,
        me,
        colors: { selected: tk.color.primary, point: tk.brand.ink, me: tk.color.casbah, background: tk.color.surfaceAlt },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, me],
  );

  useEffect(() => {
    if (selected) {
      view.current?.injectJavaScript(`select(${JSON.stringify(selected)}); true;`);
    }
  }, [selected]);

  return (
    <View
      style={[styles.box, { borderColor: tk.color.border }]}
      accessible
      accessibilityLabel={accessibilityLabel}>
      <WebView<object>
        ref={view}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://sougnadz.com' }}
        onMessage={(event: WebViewMessageEvent) => onSelect(event.nativeEvent.data)}
        style={styles.map}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 220, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  map: { flex: 1, backgroundColor: 'transparent' },
});
