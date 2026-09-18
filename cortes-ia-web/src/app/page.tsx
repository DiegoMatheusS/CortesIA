import Link from 'next/link';
import Drawer from '@/components/Drawer';
import PinnedPhoneStory from '@/components/PinnedPhoneStory';
import HeroFluidBackground from '@/components/HeroFluidBackground';

const tutorial = [
  ['Envie seu vídeo', 'Arquivo do computador ou link suportado.'],
  ['Configure os cortes', 'Quantidade, duração, redes, legenda, visual e extras.'],
  ['Confira os créditos', 'Custo base, extras, total e saldo antes de processar.'],
  ['Deixe a IA analisar', 'Transcrição, contexto, melhores momentos, reframe e previews.'],
  ['Revise e edite', 'Assista, selecione, descarte, ajuste início/fim e corrija legendas.'],
  ['Crie seu próprio corte', 'Abra o master e escolha manualmente qualquer trecho do vídeo.'],
  ['Escolha o visual', 'Combine estilos de legenda com o clima visual do clipe.'],
  ['Exporte', 'Baixe para Reels, TikTok, Shorts, Facebook e Kwai.'],
];

const captionStyles = ['Clean','Bold','Viral','Podcast','Karaoke','Pop','Box','News','Neon','Impacto'];
const moods = ['Cinema','Divertido','Animado','Sombrio','Quente','Frio'];

export default function Home() {
  return (
    <>
      <nav>
        <Link className="brand" href="/">slice<span>flow</span></Link>
        <div>
          <a href="#recursos">Recursos</a>
          <a href="#como-usar">Como usar</a>
          <a href="#creditos">Créditos</a>
          <Link href="/login">Entrar ↗</Link>
        </div>
      </nav>

      <main>
        <section className="hero">
          <HeroFluidBackground />
          <p className="eyebrow">IA + CONTROLE MANUAL</p>
          <h1>A IA encontra os melhores momentos.<br/><em>Você tem o controle final.</em></h1>
          <p>Transforme podcasts, lives, entrevistas e vídeos longos em cortes prontos para publicar — e ajuste cada detalhe antes de exportar.</p>
          <div className="hero-actions">
            <Link className="button primary" href="/criar">Começar a criar cortes ↗</Link>
            <a className="button secondary" href="#como-usar">Ver como funciona</a>
          </div>
          <small>Automação quando ajuda. Controle manual quando você precisa.</small>
          <a className="scroll-cue" href="#demonstracao" aria-label="Rolar para explorar">
            <span>Role para explorar</span><i aria-hidden="true">↓</i>
          </a>
        </section>

        <div id="demonstracao">
          <PinnedPhoneStory />
        </div>

        <Drawer />

        <section id="como-usar" className="content-section tutorial-section">
          <div className="section-intro">
            <p className="eyebrow">COMO USAR O SLICEFLOW</p>
            <h2>Como criar seu primeiro corte</h2>
            <p>Do vídeo longo ao conteúdo pronto em poucos passos.</p>
          </div>
          <div className="tutorial-layout">
            <ol className="tutorial-steps">
              {tutorial.map(([title, description], index) => (
                <li key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{title}</strong><p>{description}</p></div>
                </li>
              ))}
            </ol>
            <div className="tutorial-preview" aria-label="Prévia ilustrativa do editor SliceFlow">
              <div className="tutorial-player">
                <span className="preview-person" />
                <strong>VOCÊ DECIDE<br/><em>O CORTE FINAL.</em></strong>
                <small>00:18 → 00:56</small>
              </div>
              <div className="tutorial-timeline"><i/><i/><i/><i/><i/><span/><span/></div>
              <div className="tutorial-tools"><span>Dividir</span><span>Legenda</span><span>Crop</span><span>Capa</span><span>Preview</span></div>
            </div>
          </div>
        </section>

        <section id="recursos" className="content-section">
          <p className="eyebrow">RECURSOS</p>
          <h2>A IA acelera. O editor resolve o resto.</h2>
          <div className="grid">
            {[
              'Cortes automáticos com IA',
              'Corte manual a partir do master',
              'Timeline com ajuste de início e fim',
              'Correção de legenda e sincronismo',
              'Zoom, crop, reframe e fundo',
              'Capas e múltiplos formatos',
            ].map(item => <article key={item}>{item}</article>)}
          </div>
        </section>

        <section className="content-section style-showcase">
          <div className="section-intro">
            <p className="eyebrow">LEGENDAS</p>
            <h2>Escolha como a fala aparece.</h2>
            <p>Troque o estilo sem alterar o conteúdo do corte.</p>
          </div>
          <div className="caption-gallery">
            {captionStyles.map((style, index) => (
              <article className={`caption-style caption-style-${(index % 5) + 1}`} key={style}>
                <small>{style}</small>
                <div><span>ESSA</span> <b>PALAVRA</b><br/>merece destaque.</div>
              </article>
            ))}
          </div>
        </section>

        <section className="content-section visual-showcase">
          <div className="section-intro">
            <p className="eyebrow">ESTILO VISUAL DO CLIPE</p>
            <h2>O mesmo conteúdo. Outro clima.</h2>
            <p>Cor, contraste, temperatura e intensidade visual mudam sem inventar novas cenas ou falas.</p>
          </div>
          <div className="mood-gallery">
            {moods.map(mood => (
              <article className={`mood-card mood-${mood.toLowerCase()}`} key={mood}>
                <div className="mood-frame"><span className="preview-person" /></div>
                <strong>{mood}</strong>
              </article>
            ))}
          </div>
        </section>

        <section id="creditos" className="credits-home">
          <p className="eyebrow">CRÉDITOS</p>
          <h2>Use créditos somente quando precisar.</h2>
          <p>O custo aparece antes de cada processamento. Corrigir texto, sincronismo e outras edições leves não cria nova cobrança.</p>
          <Link className="button secondary" href="/criar">Começar sem pagar agora</Link>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">IA + EDIÇÃO</p>
            <h2>A IA cria. Você ajusta. O conteúdo fica do seu jeito.</h2>
            <Link className="button primary" href="/criar">Começar agora ↗</Link>
          </div>
        </section>
      </main>

      <footer>
        <span>SliceFlow</span>
        <a href="#recursos">Recursos</a>
        <a href="#como-usar">Como usar</a>
        <a href="#creditos">Créditos</a>
        <Link href="/legal">Termos e privacidade</Link>
        <Link href="/app">Suporte</Link>
        <Link href="/login">Login</Link>
      </footer>
    </>
  );
}
