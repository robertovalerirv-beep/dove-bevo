export async function requestJson(path: string, options: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 20_000);
  try {
    const response = await fetch(path, {
      headers: { Accept: "application/json" },
      ...options,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("unavailable");
    // Keep the deadline active until the body has been received and parsed as well.
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
