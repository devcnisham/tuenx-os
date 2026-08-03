import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// One superfamily, three roles: Condensed for display, Sans for body, Mono for
// data. Shared skeletons, so the interface reads as a single voice.
import '@fontsource/ibm-plex-sans-condensed/400.css'
import '@fontsource/ibm-plex-sans-condensed/600.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'

import './index.css'
import { applyStoredTheme } from './lib/theme.ts'
import { App } from './App.tsx'

// Before the first paint, or the page flashes light and then flips.
applyStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
