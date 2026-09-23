import { createSignalDock } from "@fielddaylabs/signaldock-sdk";

const appKey = import.meta.env.VITE_SIGNALDOCK_APP_KEY;

export const signalDock = appKey
  ? createSignalDock({
      baseUrl: import.meta.env.VITE_SIGNALDOCK_BASE_URL,
      appKey,
    })
  : null;
