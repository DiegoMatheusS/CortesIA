'use client';

import {FormEvent, useRef, useState} from 'react';
import Link from 'next/link';
import {api, friendly, key} from '@/lib/api';

type PendingAction = 'file' | 'youtube' | null;

const MAX_FILE_SIZE = 5_000_000_000;

function supportedFile(file: File) {
  return /\.(mp4|mov|mkv|webm)$/i.test(file.name);
}

function validYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

export default function CreateStudio() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  async function hasSession() {
    const response = await fetch('/api/v1/me', {
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (response.ok) return true;
    if (response.status === 401 || response.status === 403) return false;
    throw new Error('Não foi possível verificar sua sessão agora.');
  }

  async function upload(file: File) {
    if (busy) return;
    setBusy(true);
    setProgress(0);
    setMessage('');

    try {
      const session = await api<{projectId: string; uploadId: string; partSize: number}>(
        '/projects/uploads',
        'POST',
        {filename: file.name, size: file.size, title: file.name},
        {key: key()},
      );

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

        if (!response.ok) throw new Error('Falha no envio do arquivo.');

        const eTag = response.headers.get('ETag');
        if (!eTag) throw new Error('O armazenamento não retornou a confirmação da parte enviada.');

        parts.push({partNumber, eTag});
        setProgress(Math.round((Math.min(file.size, offset + session.partSize) / file.size) * 100));
      }

      await api(`/uploads/${session.uploadId}/complete`, 'POST', {parts});
      window.location.href = `/app/projects/${session.projectId}`;
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function importYoutube(url: string) {
    if (busy) return;
    setBusy(true);
    setMessage('Verificando o vídeo e as restrições da fonte…');

    try {
      const project = await api<{projectId: string}>(
        '/projects/imports',
        'POST',
        {url, title: 'Vídeo do YouTube'},
        {key: key()},
      );
      window.location.href = `/app/projects/${project.projectId}`;
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function requireSession(action: Exclude<PendingAction, null>) {
    setPending(action);
    setMessage('');

    try {
      if (await hasSession()) {
        if (action === 'file' && selectedFile) await upload(selectedFile);
        if (action === 'youtube') await importYoutube(youtubeUrl.trim());
        return;
      }

      setLoginOpen(true);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function chooseFile(file: File) {
    if (!supportedFile(file)) {
      setMessage('Use um arquivo MP4, MOV, MKV ou WebM.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessage('O limite inicial é 5 GB por vídeo.');
      return;
    }

    setSelectedFile(file);
    setPending('file');
    setMessage('');

    try {
      if (await hasSession()) {
        await upload(file);
      } else {
        setLoginOpen(true);
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function submitYoutube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = youtubeUrl.trim();

    if (!validYouTubeUrl(value)) {
      setMessage('Cole um link válido do YouTube.');
      return;
    }

    await requireSession('youtube');
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginMessage('');

    const form = new FormData(event.currentTarget);

    try {
      await api('/auth/login', 'POST', {
        email: form.get('email'),
        password: form.get('password'),
        mfaCode: form.get('mfaCode') || null,
      });

      setLoginOpen(false);

      if (pending === 'file' && selectedFile) {
        await upload(selectedFile);
      } else if (pending === 'youtube') {
        await importYoutube(youtubeUrl.trim());
      }
    } catch (error) {
      setLoginMessage(friendly((error as Error).message));
    } finally {
      setLoginBusy(false);
    }
  }

  return (
    <>
      <section className="creator-shell" aria-labelledby="creator-title">
        <div className="creator-heading">
          <p className="eyebrow">CRIE SEM BARREIRAS</p>
          <h1 id="creator-title">Envie o vídeo. A IA encontra os momentos.</h1>
          <p>
            Você pode chegar até aqui sem conta. O login só será solicitado quando iniciar um envio ou uma importação.
          </p>
        </div>

        <div className="create-grid">
          <article
            className="dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file && !busy) void chooseFile(file);
            }}
          >
            <div className="dropzone-icon" aria-hidden="true">↑</div>
            <h2>Envie seu vídeo</h2>
            <p>Arraste para cá ou escolha no computador.</p>
            <p className="source-meta">MP4, MOV, MKV ou WebM · até 5 GB · até 180 minutos</p>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy && selectedFile ? `Enviando ${progress}%` : 'Selecionar arquivo'}
            </button>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept=".mp4,.mov,.mkv,.webm"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void chooseFile(file);
                event.currentTarget.value = '';
              }}
            />
            {busy && selectedFile && <progress max={100} value={progress} aria-label="Progresso do envio" />}
          </article>

          <article className="link-source">
            <span className="source-badge">LINK</span>
            <h2>Importe do YouTube</h2>
            <p>O link é validado antes de qualquer processamento ou consumo de créditos.</p>
            <form onSubmit={submitYoutube}>
              <label htmlFor="youtube-url">Link do vídeo</label>
              <input
                id="youtube-url"
                type="url"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={busy}
                required
              />
              <button type="submit" className="secondary" disabled={busy}>
                Verificar link
              </button>
            </form>
          </article>
        </div>

        <div className="create-trust" aria-label="Informações sobre o fluxo">
          <span>Sem cobrança no upload</span>
          <span>Preço mostrado antes de processar</span>
          <span>Arquivos privados</span>
        </div>

        {message && <p className="notice creator-notice" role="status">{message}</p>}
      </section>

      {loginOpen && (
        <div className="auth-gate-backdrop">
          <section className="auth-gate" role="dialog" aria-modal="true" aria-labelledby="login-gate-title">
            <button
              type="button"
              className="auth-gate-close"
              aria-label="Fechar"
              onClick={() => {
                if (!loginBusy) setLoginOpen(false);
              }}
            >
              ×
            </button>
            <p className="eyebrow">CONTINUE DE ONDE PAROU</p>
            <h2 id="login-gate-title">Entre para iniciar.</h2>
            <p>
              Seu arquivo ainda está selecionado nesta tela. Depois do login, o envio continua automaticamente.
            </p>

            <form onSubmit={login}>
              <label>
                E-mail
                <input name="email" type="email" autoComplete="email" required autoFocus />
              </label>
              <label>
                Senha
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <label>
                Código MFA <span className="optional">(se ativado)</span>
                <input name="mfaCode" inputMode="numeric" autoComplete="one-time-code" />
              </label>
              <button type="submit" disabled={loginBusy}>
                {loginBusy ? 'Entrando…' : 'Entrar e continuar'}
              </button>
              {loginMessage && <p className="notice" role="status">{loginMessage}</p>}
            </form>

            <div className="auth-gate-links">
              <Link href="/register">Criar uma conta</Link>
              <Link href="/forgot">Esqueci minha senha</Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
