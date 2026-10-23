import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useSettingsStore, applySettingsSideEffects } from './store/useSettingsStore';
import { useCloudStore } from './store/useCloudStore';
import { initSecrets } from './services/secrets';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/vazirmatn';
import './App.css';

// Apply persisted settings (theme class, dir, language) before first render.
applySettingsSideEffects(useSettingsStore.getState());
useSettingsStore.subscribe((s) => applySettingsSideEffects(s));

// Migrate plaintext store secrets into the OS keychain when available and
// seed the in-memory read cache. Awaited before first render so cloud runs
// never race an empty cache. Never throws (falls back to store fields).
try {
  await initSecrets(
    () => useCloudStore.getState().keys,
    (id, keyHint) =>
      useCloudStore.getState().updateKey(id, { apiKey: '', storage: 'keychain', keyHint })
  );
} catch {
  // Fallback path inside initSecrets already covered this.
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
