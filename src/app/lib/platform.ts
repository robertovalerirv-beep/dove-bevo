/// <reference types="vite/client" />
import type { Located } from "./locate";
import type { MobileClient } from "./native-client";

export const isNative = import.meta.env.VITE_NATIVE === "true";
export const NATIVE_BACKGROUND = "dovebevo:native-background";
export const NATIVE_BACK = "dovebevo:native-back";
export const NATIVE_LINK = "dovebevo:native-link";
export interface NativePlatform {
  client: MobileClient;
  locate: () => Promise<Located>;
  positionGranted: () => Promise<boolean>;
  share: (title: string, url: string) => Promise<void>;
  open: (url: string) => Promise<void>;
}
let platform: NativePlatform | null = null;
export function installNativePlatform(value: NativePlatform): void {
  platform = value;
}
export function nativePlatform(): NativePlatform {
  if (!platform) throw new Error("native adapter unavailable");
  return platform;
}
/** Same-origin web requests stay unchanged; native requests are exact and token-free. */
export function publicFetch(path: string, init?: RequestInit): Promise<Response> {
  return isNative ? nativePlatform().client.read(path, init) : fetch(path, init);
}
