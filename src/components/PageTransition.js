import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Wrapper that triggers a fade-in animation on every route change.
 * Uses the CSS class .page-transition defined in App.css.
 */
export default function PageTransition({ children }) {
  const location = useLocation();

  return (
    <div className="page-transition" key={location.pathname}>
      {children}
    </div>
  );
}
