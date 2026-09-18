'use client';

import {CSSProperties, useEffect, useRef, useState} from 'react';

const stages = [
  {title: 'Envie o vídeo', caption: 'Arquivo ou link suportado'},
  {title: 'Configure', caption: 'Quantidade, duração e redes'},
  {title: 'Confira créditos', caption: 'Custo antes de processar'},
  {title: 'IA analisando', caption: 'Transcrição e seleção'},
  {title: 'Cortes sugeridos', caption: 'Revise os candidatos'},
  {title: 'Abra o editor', caption: 'Timeline e início/fim'},
  {title: 'Corrija a legenda', caption: 'Texto e sincronismo'},
  {title: 'Escolha a legenda', caption: 'Presets com preview'},
  {title: 'Escolha o visual', caption: 'Cinema, Quente, Frio…'},
  {title: 'Exporte', caption: 'Pronto para publicar'},
];

function stageFrom(progress: number) {
  if (progress < .15) return 0;
  if (progress < .25) return 1;
  if (progress < .35) return 2;
  if (progress < .50) return 3;
  if (progress < .65) return 4;
  if (progress < .78) return 5;
  if (progress < .86) return 6;
  if (progress < .93) return 7;
  if (progress < .97) return 8;
  return 9;
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

  const stage = stageFrom(progress);
  const style = {'--phone-progress': progress} as CSSProperties;

  return (
    <section ref={ref} className={`phone-story phone-story-v05 ${reduced ? 'is-reduced' : ''}`} style={style}>
      <div className="phone-pin">
        <div className="phone-story-copy">
          <p className="eyebrow">A IA CRIA. VOCÊ AJUSTA.</p>
          <h2>Do vídeo longo ao corte<br/>com controle final.</h2>
          <p>A IA encontra bons momentos. Você revisa, corrige e decide o que realmente vai ao ar.</p>
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
                {stage === 0 && <>
                  <span className="phone-kicker">NOVO PROJETO</span>
                  <h3>Envie seu vídeo</h3>
                  <p>Arquivo do computador ou link suportado.</p>
                  <div className="phone-upload-box"><b>↑</b><span>Selecionar arquivo</span><small>MP4 · MOV · MKV · WebM</small></div>
                  <div className="phone-link-line">youtube.com/watch?v=…</div>
                </>}

                {stage === 1 && <>
                  <span className="phone-kicker">CONFIGURAÇÃO</span>
                  <h3>Como você quer os cortes?</h3>
                  <div className="phone-config-grid">
                    <div><small>Quantidade</small><strong>5 cortes</strong></div>
                    <div><small>Duração</small><strong>Até 1 min</strong></div>
                    <div><small>Redes</small><strong>9:16 + 1:1</strong></div>
                    <div><small>Estilo</small><strong>Viral · Cinema</strong></div>
                  </div>
                  <div className="analysis-chip-row"><span>Legenda</span><span>Zoom</span><span>Reframe</span></div>
                </>}

                {stage === 2 && <>
                  <span className="phone-kicker">COTAÇÃO</span>
                  <h3>Confira antes de gerar</h3>
                  <div className="phone-quote">
                    <div><span>Processamento base</span><b>10</b></div>
                    <div><span>Zoom automático</span><b>+2</b></div>
                    <div><span>Fundo borrado</span><b>+3</b></div>
                    <hr />
                    <div className="phone-quote-total"><span>Total</span><b>15 créditos</b></div>
                  </div>
                  <div className="phone-success">Saldo após operação: 35 créditos</div>
                </>}

                {stage === 3 && <>
                  <span className="phone-kicker">IA EM AÇÃO</span>
                  <h3>Analisando vídeo</h3>
                  <p>Transcrição, contexto, melhores momentos e reenquadramento.</p>
                  <div className="analysis-lines"><i/><i/><i/><i/></div>
                  <div className="analysis-chip-row"><span>ASR</span><span>Contexto</span><span>Momentos</span><span>Visão</span></div>
                </>}

                {stage === 4 && <>
                  <span className="phone-kicker">CANDIDATOS</span>
                  <h3>Cortes sugeridos</h3>
                  <div className="phone-cut-list">
                    {[
                      ['A ideia que mudou tudo', '00:48'],
                      ['O erro que quase ninguém percebe', '00:36'],
                      ['Por onde começar', '00:57'],
                    ].map(([title, duration], index) => (
                      <div className="phone-cut" key={title}><b>{index + 1}</b><div><strong>{title}</strong><small>9:16 · {duration}</small></div></div>
                    ))}
                  </div>
                </>}

                {stage === 5 && <>
                  <span className="phone-kicker">EDITOR</span>
                  <h3>Ajuste o corte</h3>
                  <div className="phone-editor-preview"><span className="preview-person" /><b>00:18 → 00:56</b></div>
                  <div className="phone-timeline">
                    <i className="timeline-range" />
                    <span className="timeline-handle left" />
                    <span className="timeline-handle right" />
                    <em />
                  </div>
                  <div className="edit-tools"><span>Dividir</span><span>Remover trecho</span><span>Preview</span></div>
                </>}

                {stage === 6 && <>
                  <span className="phone-kicker">LEGENDA</span>
                  <h3>Corrija o que precisar</h3>
                  <div className="phone-caption-editor">
                    <span>00:21.4</span>
                    <p>A ideia não é <del>viralisa</del> <mark>viralizar</mark> por acaso.</p>
                  </div>
                  <div className="phone-caption-track"><i/><i/><i/><i/><i/></div>
                  <small className="phone-free-edit">Correções leves não consomem novos créditos.</small>
                </>}

                {stage === 7 && <>
                  <span className="phone-kicker">ESTILO DE LEGENDA</span>
                  <h3>Escolha como a fala aparece</h3>
                  <div className="phone-caption-presets">
                    {['Clean','Viral','Podcast','Karaoke','Neon','Impacto'].map((name, index) => (
                      <div className={index === 1 ? 'active' : ''} key={name}><span>{name}</span><b>PALAVRA</b></div>
                    ))}
                  </div>
                </>}

                {stage === 8 && <>
                  <span className="phone-kicker">ESTILO VISUAL</span>
                  <h3>Escolha o clima do clipe</h3>
                  <div className="phone-visual-preview visual-warm"><span className="preview-person" /><strong>QUENTE</strong></div>
                  <div className="phone-visual-pills"><span>Cinema</span><span className="active">Quente</span><span>Frio</span></div>
                  <small className="phone-free-edit">O visual muda. A fala e o significado não.</small>
                </>}

                {stage === 9 && <>
                  <span className="phone-kicker">FINALIZADO</span>
                  <h3>Pronto para publicar</h3>
                  <div className="phone-final-card"><span>9:16</span><strong>Seu corte está pronto.</strong><small>1080 × 1920</small></div>
                  <div className="platform-pills"><span>Reels</span><span>TikTok</span><span>Shorts</span><span>Facebook</span><span>Kwai</span></div>
                </>}
              </div>
            </div>
            <div className="phone-homebar" />
          </div>
        </div>
      </div>
    </section>
  );
}
