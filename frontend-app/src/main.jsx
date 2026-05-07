import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// StrictMode removed — causes deck.gl double-init issues in dev
createRoot(document.getElementById('root')).render(<App />)
