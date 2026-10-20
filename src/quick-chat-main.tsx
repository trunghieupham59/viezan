import React from 'react'
import ReactDOM from 'react-dom/client'
import { QuickLauncher } from './pages/QuickLauncher'
import { disablePersistedStoreWrites } from './store/useAppStore'
import './index.css'
import './styles/codex.css'
import './styles/chat.css'
import './styles/tokens.css'
import './styles/launcher.css'
import { installWebPreviewApi } from './web-preview/installWebPreviewApi'

installWebPreviewApi()

// The popup only reads the shared settings; never let its snapshot overwrite the main window's.
disablePersistedStoreWrites()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QuickLauncher />
  </React.StrictMode>
)
