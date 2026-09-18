'use client';

import {CSSProperties, useEffect, useRef, useState} from 'react';

const stages = [
  {title: 'Envie seu vídeo', caption: 'Arquivo ou link do YouTube'},
  {title: 'Upload concluído', caption: 'Fonte recebida com segurança'},
  {title: 'Analisando vídeo', caption: 'Transcrição e melhores momentos'},
  {title: 'Cortes encontrados', caption: 'Vários candidatos para revisar'},
  {title: 'Personalize', caption: 'Legenda, capa e enquadramento'},
  {title: 'Pronto para publicar', caption: 'Um arquivo para várias redes'},
];

function stageFrom(progress: number) {
  if (progress < .2) return 0;
  if (progress < .38) return 1;
  if (progress < .58) return 2;
  if (progress < .76) return 3;
  if (progress < .9) return 4;
  return 5;
}

export default function PinnedPhoneStory() {
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
        const next = Math.min(1, Math.max(0, -box.top / distance));
        setProgress(next);
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

  const stage = stageFrom(progress);
  const style = {'--phone-progress': progress} as CSSProperties;

  return (
    <section ref={ref} className={`phone-story ${reduced ? 'is-reduced' : ''}`} style={style}>
      <div className="phone-pin">
        <div className="phone-story-copy">
          <p className="eyebrow">DO ENVIO AO CORTE</p>
          <h2>Veja o fluxo acontecer<br/>enquanto você rola.</h2>
          <p>Um vídeo entra. Os melhores momentos saem organizados para você revisar.</p>
          <ol className="phone-stage-list" aria-label="Etapas da criação">
            {stages.map((item, index) => (
              <li key={item.title} className={index === stage ? 'active' : index < stage ? 'done' : ''}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{item.title}</strong><small>{item.caption}</small></div>
              </li>
            ))}
          </ol>
        </div>

        <div className="phone-visual" aria-live="polite">
          <div className="phone-glow" aria-hidden="true" />
          <div className="phone-device">
            <div className="phone-top"><span>9:41</span><i /></div>
            <div className="phone-screen">
              <div key={stage} className="phone-panel">
                {stage === 0 && (
                  <>
                    <span className="phone-kicker">NOVO PROJETO</span>
                    <h3>Envie seu vídeo</h3>
                    <p>Escolha um arquivo ou cole um link.</p>
                    <div className="phone-upload-box"><b>↑</b><span>Selecionar arquivo</span><small>MP4 · MOV · MKV · WebM</small></div>
                    <div className="phone-link-line">youtube.com/watch?v=…</div>
                  </>
                )}

                {stage === 1 && (
                  <>
                    <span className="phone-kicker">FONTE RECEBIDA</span>
                    <h3>Vídeo enviado</h3>
                    <div className="phone-file-row"><span className="phone-file-icon">▶</span><div><strong>episodio-42.mp4</strong><small>Pronto para validar</small></div></div>
                    <div className="phone-progress-track"><i /></div>
                    <div className="phone-success">✓ Upload concluído</div>
                  </>
                )}

                {stage === 2 && (
                  <>
                    <span className="phone-kicker">IA EM AÇÃO</span>
                    <h3>Analisando vídeo</h3>
                    <p>Transcrevendo, entendendo contexto e procurando os melhores momentos.</p>
                    <div className="analysis-lines"><i/><i/><i/><i/></div>
                    <div className="analysis-chip-row"><span>Transcrição</span><span>Contexto</span><span>Momentos</span></div>
                  </>
                )}

                {stage === 3 && (
                  <>
                    <span className="phone-kicker">CANDIDATOS</span>
                    <h3>Cortes encontrados</h3>
                    <div className="phone-cut-list">
                      {[
                        ['A ideia que mudou tudo', '00:48'],
                        ['O erro que quase ninguém percebe', '00:36'],
                        ['Por onde começar', '00:57'],
                      ].map(([title, duration], index) => (
                        <div className="phone-cut" key={title}><b>{index + 1}</b><div><strong>{title}</strong><small>Vertical · {duration}</small></div></div>
                      ))}
                    </div>
                  </>
                )}

                {stage === 4 && (
                  <>
                    <span className="phone-kicker">REVISÃO</span>
                    <h3>Deixe com a sua cara</h3>
                    <div className="phone-preview">
                      <span className="preview-person" />
                      <strong>UM BOM MOMENTO<br/><em>MUDA TUDO.</em></strong>
                      <small>00:48</small>
                    </div>
                    <div className="edit-tools"><span>Legendas</span><span>Capa</span><span>Zoom</span></div>
                  </>
                )}

                {stage === 5 && (
                  <>
                    <span className="phone-kicker">FINALIZADO</span>
                    <h3>Pronto para publicar</h3>
                    <div className="phone-final-card"><span>9:16</span><strong>Seu corte está pronto.</strong><small>1080 × 1920</small></div>
                    <div className="platform-pills"><span>Reels</span><span>TikTok</span><span>Shorts</span><span>Facebook</span><span>Kwai</span></div>
                  </>
                )}
              </div>
            </div>
            <div className="phone-homebar" />
          </div>
        </div>
      </div>
    </section>
  );
}
