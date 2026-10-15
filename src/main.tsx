import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/codex.css'
import './styles/chat.css'
import './styles/ai-configuration.css'
import './styles/reliability.css'
import './styles/tokens.css'
import { installWebPreviewApi } from './web-preview/installWebPreviewApi'

installWebPreviewApi()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
