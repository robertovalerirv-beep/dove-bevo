/** Maps carry viewport tile ids only; the mobile bearer is never available here. */
export function validateNativeMapUrl(raw: string, localHref = location.href): void {
  const local = new URL(localHref);
  const url = new URL(raw, localHref);
  if (url.username || url.password || url.port || url.search) throw new Error("map destination");
  if (
    url.protocol === local.protocol &&
    url.host === local.host &&
    url.pathname.startsWith("/map/")
  )
    return;
  if (url.origin === "https://tiles.openfreemap.org") return;
  throw new Error("map destination");
}

export async function fetchNativeMap(
  params: { url: string; type?: string },
  controller: AbortController,
): Promise<{ data: object | string }> {
  const url = params.url.replace(/^dovebevo-map:\/\//, "https://");
  validateNativeMapUrl(url);
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    signal: controller.signal,
  });
  if (!response.ok) throw new Error("map unavailable");
  if (params.type === "json") {
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) throw new Error("map data");
    return { data };
  }
  if (params.type === "string") return { data: await response.text() };
  return { data: await response.arrayBuffer() };
}
