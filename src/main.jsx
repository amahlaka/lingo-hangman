import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/tokens.css'
import './styles/lingo.css'
import './styles/app.css'
import { registerSW } from 'virtual:pwa-register';
import { loadPublishedContent } from './lib/content';
import { loadSpeechClips } from './lib/speech';
import { loadSync } from './lib/sync';
import { refreshOnDemandSpeech } from './lib/tts';
import { refreshReminders } from './lib/push';

// Games read words synchronously, so switch to the newest published word bank
// first. If that is slow or offline, the copy built into the app is used.
loadPublishedContent().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})

registerSW();

// Recorded voice clips; the browser's own voice is used until they load.
loadSpeechClips();
// On-demand speech for text without a clip, and this device's reminders, on a
// device signed in to an account (so signed-out visitors never call the API).
try {
  const linked = loadSync(window.localStorage);
  if (linked.user && !linked.paused) {
    refreshOnDemandSpeech();
    refreshReminders();
  }
} catch {
  // Storage blocked: no account here either.
}
