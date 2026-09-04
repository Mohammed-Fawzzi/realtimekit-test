import React from 'react';
import ReactDOM from 'react-dom/client';

import '@excalidraw/excalidraw/index.css';

import App from './App.jsx';
import './index.css';
import './App.css';
import './whiteboard.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);