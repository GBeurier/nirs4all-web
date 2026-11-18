import { createRoot } from 'react-dom/client'
import Deck from './Deck'
import '../styles/fonts.css'
import 'nirs4all-ui/assets/theme.css'
import 'nirs4all-ui/assets/pipelineEditor.css'
import './deck.css'

createRoot(document.getElementById('root')!).render(<Deck />)
