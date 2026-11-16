import { createRoot } from 'react-dom/client'
import MultimodalApp from './MultimodalApp'
import '../styles/fonts.css'
import 'nirs4all-ui/assets/styles/nirs4all-default.css'
import 'nirs4all-ui/assets/multimodal.css'
import './host.css'

createRoot(document.getElementById('root')!).render(<MultimodalApp />)
