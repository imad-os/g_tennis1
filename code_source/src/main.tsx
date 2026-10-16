import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { mypcBridge } from './services/mypcBridge.ts';

// Initialize MyPC SDK handshake immediately at script load
mypcBridge.initBridge();

createRoot(document.getElementById('root')!).render(<App />);
