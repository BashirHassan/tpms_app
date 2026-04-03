/**
 * RouteProgressBar
 * NProgress-style thin animated bar at top of viewport during route transitions.
 * Detects route changes via useLocation() and shows a smooth progress animation.
 */

import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export default function RouteProgressBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    // Skip on initial render
    if (prevPathRef.current === location.pathname) return;
    prevPathRef.current = location.pathname;

    // Clear any existing timers
    clearTimeout(timeoutRef.current);
    clearInterval(intervalRef.current);

    // Start progress
    setVisible(true);
    setProgress(15);

    // Simulate progress trickle
    let current = 15;
    intervalRef.current = setInterval(() => {
      current += Math.random() * 12;
      if (current > 90) current = 90;
      setProgress(current);
    }, 200);

    // Complete after a small delay (content usually loads fast)
    timeoutRef.current = setTimeout(() => {
      clearInterval(intervalRef.current);
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }, 150);

    return () => {
      clearTimeout(timeoutRef.current);
      clearInterval(intervalRef.current);
    };
  }, [location.pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
      <div
        className="h-[3px] bg-primary-500 transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          boxShadow: '0 0 8px rgba(16, 185, 129, 0.4)',
        }}
      />
    </div>
  );
}
