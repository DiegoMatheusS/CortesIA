import Link from 'next/link';
import Drawer from '@/components/Drawer';
import PinnedPhoneStory from '@/components/PinnedPhoneStory';

export default function Home() {
  return (
    <>
      <nav>
        <Link className="brand" href="/">cortes<span>ia</span></Link>
        <div>
          <a href="#recursos">Recursos</a>
          <a href="#como">Como funciona</a>
          <Link href="/login">Entrar ↗</Link>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="water" aria-hidden="true" />
          <div className="hero-orb hero-orb-a" aria-hidden="true" />
          <div className="hero-orb hero-orb-b" aria-hidden="true" />
          <p className="eyebrow">DO VÍDEO LONGO AO MOMENTO CERTO</p>
          <h1>Transforme vídeos longos em<br/><em>cortes prontos para viralizar.</em></h1>
          <p>Transforme podcasts, lives, entrevistas e vídeos longos em cortes prontos para Reels, TikTok, Shorts, Facebook e Kwai.</p>
          <div className="hero-actions">
            <Link className="button primary" href="/criar">Começar a criar cortes ↗</Link>
            <a className="button secondary" href="#como">Ver como funciona</a>
          </div>
          <small>Créditos avulsos. Sem mensalidade obrigatória.</small>
          <a className="scroll-cue" href="#demonstracao" aria-label="Rolar para explorar">
            <span>Role para explorar</span><i aria-hidden="true">↓</i>
          </a>
        </section>

        <div id="demonstracao">
          <PinnedPhoneStory />
        </div>

        <Drawer />

        <section id="como" className="content-section">
          <p className="eyebrow">SIMPLES DO COMEÇO AO CORTE</p>
          <h2>Você escolhe o que vai ao ar.</h2>
          <div className="steps">
            {['Envie um vídeo','Escolha duração e quantidade','A IA encontra os melhores momentos','Personalize legenda e efeitos','Baixe pronto para publicar'].map((item, index) => (
              <article key={item}><b>0{index + 1}</b><h3>{item}</h3></article>
            ))}
          </div>
        </section>

        <section id="recursos" className="content-section">
          <p className="eyebrow">RECURSOS</p>
          <h2>Menos trabalho repetitivo.<br/>Mais espaço para criar.</h2>
          <div className="grid">
            {[
              'Cortes automáticos com IA',
              'Legendas simples e dinâmicas',
              'Zoom automático e fundo borrado',
              'Enquadramento inteligente',
              'Capas automáticas',
              'Reels · TikTok · Shorts · Facebook · Kwai',
            ].map(item => <article key={item}>{item}</article>)}
          </div>
        </section>

        <section className="credits-home">
          <p className="eyebrow">CRÉDITOS</p>
          <h2>Use créditos somente quando precisar.</h2>
          <p>O custo aparece antes de iniciar cada processamento. Extras ficam separados na cotação.</p>
          <Link className="button secondary" href="/criar">Começar sem pagar agora</Link>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">PRONTO PARA COMEÇAR?</p>
            <h2>Seu próximo vídeo pode render vários conteúdos.</h2>
            <Link className="button primary" href="/criar">Começar agora ↗</Link>
          </div>
        </section>
      </main>

      <footer>
        <span>Cortes IA</span>
        <a href="#recursos">Recursos</a>
        <a href="#como">Como funciona</a>
        <Link href="/legal">Termos e privacidade</Link>
        <Link href="/app">Suporte</Link>
        <Link href="/login">Login</Link>
      </footer>
    </>
  );
}
