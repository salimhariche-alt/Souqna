import type { RelayPoint } from '@/api/delivery';

/**
 * A small web page with an OpenStreetMap map (Leaflet) and one dot per relay point.
 * Used inside a WebView on phones and an iframe on the web (relay-map.tsx / .web.tsx).
 *
 * - Tapping a dot sends its id back to the app ("select" it).
 * - The app highlights a point with the message {sougnaSelect: id}.
 * - OpenStreetMap needs no key; its tiles are free for light use with the credit shown
 *   on the map. A busy app should switch to a paid tile service (see CLAUDE.md).
 */
export function relayMapHtml({
  points,
  selected,
  me,
  colors,
}: {
  points: RelayPoint[];
  selected: string | null;
  /** The phone's position, only drawn on the map (it never leaves the phone). */
  me: { lat: number; lng: number } | null;
  colors: { selected: string; point: string; me: string; background: string };
}) {
  const data = JSON.stringify({
    points: points.map((p) => ({ id: p.id, lat: p.latitude, lng: p.longitude, name: p.name })),
    selected,
    me,
    colors,
  }).replace(/</g, '\\u003c'); // never close the <script> tag by accident
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{margin:0;height:100%;}#map{background:${colors.background};}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var D = ${data};
var selected = D.selected;
var map = L.map('map', { zoomControl: true });
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18, attribution: '&copy; OpenStreetMap'
}).addTo(map);
function look(id) {
  return id === selected
    ? { radius: 11, color: '#fff', weight: 3, fillColor: D.colors.selected, fillOpacity: 1 }
    : { radius: 8, color: '#fff', weight: 2, fillColor: D.colors.point, fillOpacity: 0.9 };
}
function send(id) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(id);
  else window.parent.postMessage({ sougnaRelay: id }, '*');
}
var markers = {};
D.points.forEach(function (p) {
  var m = L.circleMarker([p.lat, p.lng], look(p.id)).addTo(map);
  m.on('click', function () { send(p.id); });
  markers[p.id] = m;
});
if (D.me) {
  L.circleMarker([D.me.lat, D.me.lng], { radius: 6, color: '#fff', weight: 2, fillColor: D.colors.me, fillOpacity: 1 }).addTo(map);
}
map.fitBounds(L.latLngBounds(D.points.map(function (p) { return [p.lat, p.lng]; })), { padding: [28, 28], maxZoom: 14 });
if (selected && markers[selected]) markers[selected].bringToFront();
function select(id) {
  var old = selected;
  selected = id;
  if (markers[old]) markers[old].setStyle(look(old));
  if (markers[id]) { markers[id].setStyle(look(id)); markers[id].bringToFront(); map.panTo(markers[id].getLatLng()); }
}
window.addEventListener('message', function (e) { if (e.data && e.data.sougnaSelect) select(e.data.sougnaSelect); });
document.addEventListener('message', function (e) { try { var d = JSON.parse(e.data); if (d.sougnaSelect) select(d.sougnaSelect); } catch (x) {} });
</script>
</body></html>`;
}
