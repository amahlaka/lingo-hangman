import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/tokens.css'
import './styles/lingo.css'
import './styles/app.css'
import { registerSW } from 'virtual:pwa-register';
import { loadPublishedContent } from './lib/content';

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
