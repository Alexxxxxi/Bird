import React from 'react';
import { createRoot } from 'react-dom/client';
import HandAR from './components/HandAR';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<HandAR />);
}