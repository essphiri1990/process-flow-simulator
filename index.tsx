import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initProcessBoxSdk } from './processBoxSdk';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const processBoxSdk = initProcessBoxSdk('process-flow-simulator');
void processBoxSdk?.trackAppOpened({
  source: 'process-flow-simulator',
});

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
