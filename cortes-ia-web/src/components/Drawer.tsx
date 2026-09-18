'use client';

import {CSSProperties, useEffect, useRef, useState} from 'react';

const files = ['Disciplina', 'Podcast', 'Tecnologia', 'Negócios', 'Entrevista'];

export default function Drawer() {
  const ref = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);

    if (media.matches) {
      setProgress(1);
      return;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = ref.current;
        if (!element) return;
        const box = element.getBoundingClientRect();
        const distance = Math.max(1, box.height - window.innerHeight);
        setProgress(Math.min(1, Math.max(0, -box.top / distance)));
      });
    };

    window.addEventListener('scroll', update, {passive: true});
    window.addEventListener('resize', update);
    update();

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, []);

  const open = Math.min(1, Math.max(0, (progress - .12) / .22));
  const featuredProgress = Math.min(1, Math.max(0, (progress - .74) / .26));
  const active = progress < .3 ? -1 : progress < .45 ? 0 : progress < .6 ? 2 : progress < .74 ? 3 : 1;
  const style = {'--drawer-open': open} as CSSProperties;

  return (
    <section ref={ref} className={`drawer-story ${reduced ? 'is-reduced' : ''}`} style={style}>
      <div className="drawer-pin">
        <div className="drawer-story-copy">
          <p className="eyebrow">UM ARQUIVO DE POSSIBILIDADES</p>
          <h2>Um vídeo longo.<br/>Vários conteúdos prontos.</h2>
          <p>Os cortes ficam organizados como fichas. Continue rolando para explorar e destacar um deles.</p>
        </div>

        <div className="drawer-scene" role="img" aria-label="Gaveta com vários cortes organizados; um corte sai e ganha destaque">
          <div className="drawer-shadow" aria-hidden="true" />
          <div className="drawer-back" />

          {files.map((name, index) => {
            const isFeatured = index === 1 && progress >= .74;
            const isActive = index === active;
            const lift = isFeatured ? featuredProgress * 300 : isActive ? 72 : Math.max(0, open * 18 - index * 2);
            const rotate = isFeatured ? -featuredProgress * 6 : (index - 2) * 1.2;
            const scale = isFeatured ? 1 + featuredProgress * .13 : 1;
            const cardStyle = {
              transform: `translateX(${(index - 2) * 8}px) translateY(${-lift}px) rotate(${rotate}deg) scale(${scale})`,
              zIndex: isFeatured ? 9 : isActive ? 5 : 2 + index,
            } as CSSProperties;

            return (
              <div key={name} className={`drawer-file ${isActive ? 'active' : ''} ${isFeatured ? 'featured' : ''}`} style={cardStyle}>
                <span className="drawer-tab">{name}</span>
                <div className="drawer-preview">
                  <small>PRÉVIA 9:16</small>
                  <strong>{name === 'Podcast' ? 'SEUS MELHORES\nMOMENTOS.' : name.toUpperCase()}</strong>
                  <span>00:{42 + index * 3}</span>
                </div>
              </div>
            );
          })}

          <div className="drawer-front">
            <span>SEUS CORTES</span>
            <div className="drawer-handle" />
          </div>
        </div>

        <div className={`drawer-result ${progress > .86 ? 'visible' : ''}`}>
          <strong>Seus melhores momentos, organizados e prontos para publicar.</strong>
          <div><span>Reels</span><span>TikTok</span><span>Shorts</span><span>Facebook</span><span>Kwai</span></div>
        </div>
      </div>
    </section>
  );
}
