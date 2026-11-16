import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { checkAiHealth } from './ai/provider';
import './styles.css';
void checkAiHealth();
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
