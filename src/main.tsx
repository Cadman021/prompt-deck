import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useSettingsStore, applySettingsSideEffects } from "./store/useSettingsStore";
import './App.css'

// Apply persisted settings (theme class, dir, language) before first render.
applySettingsSideEffects(useSettingsStore.getState());
useSettingsStore.subscribe((s) => applySettingsSideEffects(s));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
