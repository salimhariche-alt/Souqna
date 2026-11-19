import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTokens } from '@/theme';

import type { RelayMapProps } from './relay-map';
import { relayMapHtml } from './relay-map-html';

/** Website: the same OpenStreetMap map, in an iframe (no WebView on the web). */
export function RelayMap({ points, selected, onSelect, me, accessibilityLabel }: RelayMapProps) {
  const tk = useTokens();
  const frame = useRef<HTMLIFrameElement>(null);
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

  // A dot tapped on the map.
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const id = (event.data as { sougnaRelay?: unknown } | null)?.sougnaRelay;
      if (typeof id === 'string') onSelect(id);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onSelect]);

  // A point chosen in the list: highlight it on the map.
  useEffect(() => {
    if (selected) frame.current?.contentWindow?.postMessage({ sougnaSelect: selected }, '*');
  }, [selected]);

  return (
    <View style={[styles.box, { borderColor: tk.color.border }]} accessibilityLabel={accessibilityLabel}>
      <iframe
        ref={frame}
        title={accessibilityLabel}
        srcDoc={html}
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
        // Same origin: OpenStreetMap refuses tile requests without a referrer (the
        // page inside is our own map, built from escaped data).
        sandbox="allow-scripts allow-same-origin"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 220, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
});
