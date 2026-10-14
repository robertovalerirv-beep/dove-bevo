// Outbound directions. Positions never leave the device.

/** "Indicazioni" link (SPEC 7.2): geo: on Android, Apple Maps on iOS, OpenStreetMap elsewhere. */
export function directionsUrl(lat: number, lon: number, userAgent = navigator.userAgent): string {
  const at = `${String(lat)},${String(lon)}`;
  if (/Android/i.test(userAgent)) return `geo:${at}?q=${at}`;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return `https://maps.apple.com/?ll=${at}&q=${at}`;
  return `https://www.openstreetmap.org/?mlat=${String(lat)}&mlon=${String(lon)}#map=18/${String(lat)}/${String(lon)}`;
}
