/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const CESIUM_BASE_URL: string;
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_MAPTILER_KEY?: string;
  readonly VITE_CESIUM_ION_TOKEN?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
