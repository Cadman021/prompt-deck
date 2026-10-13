import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useSettingsStore, applySettingsSideEffects } from "./store/useSettingsStore";
import { useCloudStore } from "./store/useCloudStore";
import { initSecrets } from "./services/secrets";
import './App.css'

// Apply persisted settings (theme class, dir, language) before first render.
applySettingsSideEffects(useSettingsStore.getState());
useSettingsStore.subscribe((s) => applySettingsSideEffects(s));

// Seed the secrets cache (currently from the store fields; a future OS-keychain
// backend migrates here — see services/secrets.ts).
initSecrets(useCloudStore.getState().keys);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
