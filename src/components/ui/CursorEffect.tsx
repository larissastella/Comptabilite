import { useEffect, useRef, useState } from 'react';

/**
 * Subtle custom cursor: a small solid dot follows the mouse exactly, and
 * a larger ring trails behind it with smooth easing. Purely decorative
 * (pointer-events: none), automatically disabled on touch devices where
 * there's no real mouse to track.
 */
export default function CursorEffect() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Touch/coarse-pointer devices (phones, tablets) have no real cursor
    // to track -- skip entirely so it never interferes with mobile.
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouchDevice) return;
    setEnabled(true);

    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ring = { x: mouse.x, y: mouse.y };
    let rafId: number;
    let visible = false;

    function handleMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!visible) {
        visible = true;
        dotRef.current?.style.setProperty('opacity', '1');
        ringRef.current?.style.setProperty('opacity', '1');
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mouse.x}px, ${mouse.y}px, 0) translate(-50%, -50%)`;
      }
    }

    function handleLeave() {
      visible = false;
      dotRef.current?.style.setProperty('opacity', '0');
      ringRef.current?.style.setProperty('opacity', '0');
    }

    function animateRing() {
      // Ease the ring toward the dot's position for a smooth trailing feel.
      ring.x += (mouse.x - ring.x) * 0.15;
      ring.y += (mouse.y - ring.y) * 0.15;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%)`;
      }
      rafId = requestAnimationFrame(animateRing);
    }

    window.addEventListener('mousemove', handleMove, { passive: true });
    document.addEventListener('mouseleave', handleLeave);
    rafId = requestAnimationFrame(animateRing);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseleave', handleLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={dotRef}
        className="fixed top-0 left-0 pointer-events-none z-[9999] opacity-0 transition-opacity duration-200"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#0057D9',
          boxShadow: '0 0 8px 2px rgba(0, 87, 217, 0.5)',
        }}
      />
      <div
        ref={ringRef}
        className="fixed top-0 left-0 pointer-events-none z-[9998] opacity-0 transition-opacity duration-300"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '1.5px solid rgba(0, 87, 217, 0.35)',
          boxShadow: '0 0 16px 4px rgba(0, 87, 217, 0.12)',
        }}
      />
    </>
  );
}
