// Device-side geography: distances and outbound directions. Positions never leave the device.

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(a));
}

/** "Indicazioni" link (SPEC 7.2): geo: on Android, Apple Maps on iOS, OpenStreetMap elsewhere. */
export function directionsUrl(lat: number, lon: number, userAgent = navigator.userAgent): string {
  const at = `${String(lat)},${String(lon)}`;
  if (/Android/i.test(userAgent)) return `geo:${at}?q=${at}`;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return `https://maps.apple.com/?ll=${at}&q=${at}`;
  return `https://www.openstreetmap.org/?mlat=${String(lat)}&mlon=${String(lon)}#map=18/${String(lat)}/${String(lon)}`;
}
