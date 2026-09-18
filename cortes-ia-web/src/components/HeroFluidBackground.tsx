'use client';

import {useEffect, useRef} from 'react';

export default function HeroFluidBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;

    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = ref.current;
        if (!element) return;
        const x = event.clientX / Math.max(1, window.innerWidth) - .5;
        const y = event.clientY / Math.max(1, window.innerHeight) - .5;
        element.style.setProperty('--fluid-x', `${x * 34}px`);
        element.style.setProperty('--fluid-y', `${y * 24}px`);
        element.style.setProperty('--fluid-rx', `${y * -3}deg`);
        element.style.setProperty('--fluid-ry', `${x * 4}deg`);
      });
    };

    window.addEventListener('pointermove', move, {passive: true});
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="hero-fluid" aria-hidden="true">
      <div className="fluid-depth" />
      <div className="fluid-wave fluid-wave-a" />
      <div className="fluid-wave fluid-wave-b" />
      <div className="fluid-shine" />
      <div className="fluid-grain" />
    </div>
  );
}
