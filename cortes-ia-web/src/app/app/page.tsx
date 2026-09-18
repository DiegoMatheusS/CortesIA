'use client';

import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {api, friendly, key} from '@/lib/api';

type Project = {id: string; title: string; status: string; outcome?: string; durationMs: number};
type Me = {name: string; email: string; admin: boolean; twoFactorEnabled: boolean};
type Wallet = {wallet: {available: number; reserved: number}; lots: {kind: string; available: number}[]};
type Package = {name: string; credits: number; bonus: number; amountMinor: number};

const statusLabel: Record<string, string> = {
  ENVIANDO: 'Enviando',
  RECEBIDO: 'Recebido',
  TRANSCRIBINDO: 'Transcrevendo',
  ANALISANDO: 'Analisando',
  GERANDO_PREVIAS: 'Gerando prévias',
  AGUARDANDO_REVISAO: 'Aguardando revisão',
  RENDERIZANDO: 'Renderizando',
  PRONTO: 'Pronto',
  ERRO: 'Erro',
  BLOQUEADO_RESTRICAO: 'Fonte bloqueada',
  ARQUIVOS_EXPIRADOS: 'Arquivos expirados',
};

export default function Dashboard() {
  const [me, setMe] = useState<Me>();
  const [wallet, setWallet] = useState<Wallet>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [mfa, setMfa] = useState('');

  const balances = useMemo(() => {
    const lots = wallet?.lots ?? [];
    const sum = (kinds: string[]) => lots.filter(lot => kinds.includes(lot.kind)).reduce((total, lot) => total + lot.available, 0);

    return {
      purchased: sum(['PURCHASED']),
      bonus: sum(['PURCHASE_BONUS']),
      benefits: sum(['TRIAL', 'PROMOTION', 'ADMIN_COMPENSATION']),
    };
  }, [wallet]);

  function handleSessionError(error: unknown) {
    const code = (error as Error).message;
    if (code === 'UNAUTHORIZED' || code === 'HTTP 401') {
      window.location.href = '/login';
      return true;
    }
    return false;
  }

  async function refresh() {
    try {
      const [user, balance, projectList, packageList] = await Promise.all([
        api<Me>('/me'),
        api<Wallet>('/wallet'),
        api<Project[]>('/projects'),
        api<Package[]>('/packages'),
      ]);

      setMe(user);
      setWallet(balance);
      setProjects(projectList);
      setPackages(packageList);
    } catch (error) {
      if (!handleSessionError(error)) setMessage(friendly((error as Error).message));
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, []);

  async function upload(file: File) {
    if (busy) return;
    setBusy(true);
    setProgress(0);
    setMessage('');

    try {
      if (file.size > 5_000_000_000) throw new Error('O limite inicial é 5 GB.');

      const session = await api<{projectId: string; uploadId: string; partSize: number}>(
        '/projects/uploads',
        'POST',
        {filename: file.name, size: file.size, title: file.name},
        {key: key()},
      );

      await refresh();
      const parts: {partNumber: number; eTag: string}[] = [];

      for (let offset = 0, partNumber = 1; offset < file.size; offset += session.partSize, partNumber++) {
        const signed = await api<{url: string}>(
          `/uploads/${session.uploadId}/parts`,
          'POST',
          {partNumber},
        );

        const response = await fetch(signed.url, {
          method: 'PUT',
          body: file.slice(offset, offset + session.partSize),
        });

        if (!response.ok) throw new Error('Falha no envio.');

        const eTag = response.headers.get('ETag');
        if (!eTag) throw new Error('Storage não expõe ETag. Verifique CORS.');

        parts.push({partNumber, eTag});
        setProgress(Math.round((Math.min(file.size, offset + session.partSize) / file.size) * 100));
      }

      await api(`/uploads/${session.uploadId}/complete`, 'POST', {parts});
      window.location.href = `/app/projects/${session.projectId}`;
    } catch (error) {
      if (!handleSessionError(error)) setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <nav>
        <Link className="brand" href="/">slice<span>flow</span></Link>
        <div>
          <span className="nav-user">{me?.name}</span>
          {me?.admin && <Link href="/admin">Admin</Link>}
          <button
            className="secondary"
            onClick={async () => {
              await api('/auth/logout', 'POST');
              window.location.href = '/login';
            }}
          >
            Sair
          </button>
        </div>
      </nav>

      <main className="workspace dashboard">
        <section className="dashboard-hero">
          <div>
            <p className="eyebrow">SEU ESTÚDIO</p>
            <h1>O próximo corte começa aqui.</h1>
            <p>Crie, acompanhe e reabra seus projetos em um só lugar.</p>
          </div>
          <Link className="button primary" href="/criar">+ Criar novo corte</Link>
        </section>

        <div className="stats dashboard-stats">
          <article><small>Disponíveis</small><strong>{wallet?.wallet.available ?? '—'}</strong></article>
          <article><small>Comprados</small><strong>{wallet ? balances.purchased : '—'}</strong></article>
          <article><small>Bônus</small><strong>{wallet ? balances.bonus : '—'}</strong></article>
          <article><small>Benefícios</small><strong>{wallet ? balances.benefits : '—'}</strong></article>
          <article><small>Reservados</small><strong>{wallet?.wallet.reserved ?? '—'}</strong></article>
        </div>

        <section className="dashboard-section">
          <div className="section-heading">
            <div><p className="eyebrow">CRIAÇÃO RÁPIDA</p><h2>Envie ou importe.</h2></div>
            <Link href="/criar">Abrir tela completa ↗</Link>
          </div>

          <div className="grid">
            <article className="upload">
              <h3>Envie seu vídeo</h3>
              <p>MP4, MOV, MKV ou WebM · até 5 GB · 180 minutos</p>
              <label className="button">
                {busy ? `Enviando ${progress}%` : 'Selecionar arquivo'}
                <input
                  hidden
                  type="file"
                  accept=".mp4,.mov,.mkv,.webm"
                  disabled={busy}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {busy && <progress max={100} value={progress} />}
            </article>

            <article>
              <h3>Importe do YouTube</h3>
              <p>Somente conteúdo acessível e permitido.</p>
              <form
                onSubmit={async event => {
                  event.preventDefault();
                  if (busy) return;
                  const form = new FormData(event.currentTarget);
                  setBusy(true);
                  try {
                    const project = await api<{projectId: string}>(
                      '/projects/imports',
                      'POST',
                      {url: form.get('url'), title: 'Vídeo do YouTube'},
                      {key: key()},
                    );
                    window.location.href = `/app/projects/${project.projectId}`;
                  } catch (error) {
                    if (!handleSessionError(error)) setMessage(friendly((error as Error).message));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <input name="url" type="url" placeholder="https://www.youtube.com/watch?v=..." required />
                <button disabled={busy}>Verificar link</button>
              </form>
            </article>
          </div>
        </section>

        {message && <p role="status" className="notice dashboard-notice">{message}</p>}

        <section className="dashboard-section">
          <div className="section-heading">
            <div><p className="eyebrow">PROJETOS</p><h2>Suas criações</h2></div>
            <span>{projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}</span>
          </div>

          {!projects.length && (
            <div className="empty-state">
              <strong>Você ainda não criou nenhum projeto.</strong>
              <p>Comece com um vídeo do seu computador ou um link suportado.</p>
              <Link className="button primary" href="/criar">Criar primeiro corte</Link>
            </div>
          )}

          <div className="project-list">
            {projects.map(project => (
              <Link href={`/app/projects/${project.id}`} key={project.id}>
                <span>
                  <strong>{project.title}</strong>
                  <small>{project.durationMs ? `${Math.ceil(project.durationMs / 60000)} min` : 'Aguardando validação'}</small>
                </span>
                <small className="project-status">
                  {project.outcome === 'NO_SUITABLE_CLIPS'
                    ? 'Nenhum trecho adequado'
                    : statusLabel[project.status] ?? project.status}
                </small>
              </Link>
            ))}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <div><p className="eyebrow">CRÉDITOS</p><h2>Compre somente quando precisar.</h2></div>
          </div>

          <div className="packages">
            {packages.map(item => (
              <article key={item.name}>
                <h3>{item.name}</h3>
                <strong>{item.credits + item.bonus}</strong>
                <p>{item.credits} comprados + {item.bonus} bônus</p>
                <p>{(item.amountMinor / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</p>
                <button
                  onClick={async () => {
                    try {
                      const purchase = await api<{id: string; checkoutUrl?: string}>(
                        '/purchases',
                        'POST',
                        {package: item.name},
                        {key: key()},
                      );

                      if (purchase.checkoutUrl) {
                        window.location.href = purchase.checkoutUrl;
                      } else {
                        setMessage('Compra local de teste criada. Nenhum pagamento real.');
                        await api(`/dev/purchases/${purchase.id}/approve`, 'POST', {});
                        await refresh();
                      }
                    } catch (error) {
                      if (!handleSessionError(error)) setMessage(friendly((error as Error).message));
                    }
                  }}
                >
                  Comprar
                </button>
              </article>
            ))}
          </div>
          <small>Preços comerciais sujeitos à ativação no catálogo. Em ambiente local, compras são fictícias.</small>
        </section>

        {me?.admin && !me.twoFactorEnabled && (
          <section className="dashboard-section">
            <h2>Ative o MFA administrativo</h2>
            <button
              onClick={async () => {
                const result = await api<{key: string}>('/auth/mfa/enroll', 'POST', {});
                setMfa(result.key);
              }}
            >
              Gerar chave do autenticador
            </button>
            {mfa && (
              <>
                <code>{mfa}</code>
                <form
                  onSubmit={async event => {
                    event.preventDefault();
                    try {
                      await api('/auth/mfa/confirm', 'POST', {code: new FormData(event.currentTarget).get('code')});
                      window.location.href = '/login';
                    } catch (error) {
                      setMessage((error as Error).message);
                    }
                  }}
                >
                  <input name="code" aria-label="Código MFA" required />
                  <button>Confirmar e entrar novamente</button>
                </form>
              </>
            )}
          </section>
        )}

        <section className="dashboard-section support-card">
          <div>
            <p className="eyebrow">SUPORTE</p>
            <h2>Precisa de ajuda?</h2>
            <p>Abra um chamado sem sair do seu estúdio.</p>
          </div>
          <form
            onSubmit={async event => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              try {
                await api('/tickets', 'POST', {
                  subject: form.get('subject'),
                  message: form.get('message'),
                  projectId: null,
                });
                setMessage('Chamado aberto.');
                event.currentTarget.reset();
              } catch (error) {
                if (!handleSessionError(error)) setMessage((error as Error).message);
              }
            }}
          >
            <input name="subject" placeholder="Assunto" required />
            <textarea name="message" placeholder="Descreva sua dúvida" required />
            <button>Abrir chamado</button>
          </form>
        </section>
      </main>
    </>
  );
}
