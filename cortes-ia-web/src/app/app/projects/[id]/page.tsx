'use client';

import {use, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {api, friendly, key} from '@/lib/api';

type SubtitleWord = {startMs: number; endMs: number; word: string};
type Subtitle = {startMs: number; endMs: number; text: string; words?: SubtitleWord[]};
type Segment = {startMs: number; endMs: number};
type Crop = {x: number; y: number; width: number; height: number};

type Clip = {
  id: string;
  title: string;
  reason: string;
  startMs: number;
  endMs: number;
  selection: string;
  revision: number;
  style: string;
  segments: Segment[];
  subtitles: Subtitle[];
  captionPreset: string;
  visualStyle: string;
  aspect: string;
  crop: Crop;
  previewRevision: number;
  preview?: string;
  cover?: string;
};

type Revision = {
  id: string;
  number: number;
  title: string;
  selection: string;
  startMs: number;
  endMs: number;
  segments: Segment[];
  subtitles: Subtitle[];
  style: string;
  captionPreset: string;
  visualStyle: string;
  aspect: string;
  crop: Crop;
  createdAt: string;
};

type EditorMeta = {
  durationMs: number;
  masterAvailable: boolean;
  masterUrl?: string | null;
  captionPresets: string[];
  visualStyles: string[];
  aspects: string[];
  capabilities: {
    manualCuts: boolean;
    nonDestructiveRevisions: boolean;
    segments: boolean;
    captionSync: boolean;
    manualCrop: boolean;
    intelligentReframe?: boolean;
    dynamicCaptions?: boolean;
  };
};

type Project = {
  id: string;
  title: string;
  status: string;
  outcome?: string;
  durationMs: number;
};

type ProjectProgress = {
  active: boolean;
  job?: {
    id: string;
    stage: string;
    state: string;
    progressPhase: string;
    progressPercent: number;
    error?: string;
    createdAt: string;
  } | null;
};

type Quote = {
  id: string;
  total: number;
  balance: number;
  balanceAfter: number;
  items: {code: string; description: string; credits: number}[];
};

type Export = {
  id: string;
  clipId: string;
  format: string;
  revision: number;
  state: string;
  url?: string;
};

const extras = [
  ['dynamic_captions', 'Legenda dinâmica', 3],
  ['zoom', 'Zoom automático', 2],
  ['blur', 'Fundo borrado', 3],
  ['tracking', 'Enquadramento inteligente', 2],
  ['cover', 'Capa automática', 2],
] as const;

const fallbackCaptionPresets = ['Clean','Bold','Viral','Podcast','Karaoke','Pop','Minimal','Box','News','Dark','Neon','Impacto','Emoji','Subtitle Classic','Creator','Custom'];
const fallbackVisualStyles = ['Cinema','Divertido','Animado','Sombrio','Quente','Frio','Clean','Podcast','Impactante','Viral'];
const fallbackAspects = ['9:16','4:5','1:1','16:9','original'];

const progressLabels: Record<string,string> = {
  QUEUED: 'Na fila',
  STARTING: 'Iniciando',
  READING_LINK: 'Lendo link',
  DOWNLOADING_SOURCE: 'Baixando arquivo',
  DOWNLOADING_LINK: 'Baixando vídeo',
  SCANNING_SOURCE: 'Verificando arquivo',
  VALIDATING_SOURCE: 'Validando fonte',
  VALIDATING_MEDIA: 'Validando vídeo',
  SOURCE_READY: 'Fonte pronta',
  PREPARING_AI: 'Preparando IA',
  NORMALIZING_MEDIA: 'Preparando vídeo',
  SAVING_MASTER: 'Salvando master',
  EXTRACTING_AUDIO: 'Extraindo áudio',
  TRANSCRIBING: 'Transcrevendo',
  TRANSCRIPT_READY: 'Transcrição pronta',
  LOADING_TRANSCRIPT: 'Carregando transcrição',
  SELECTING_CLIPS: 'Buscando melhores momentos',
  REVIEWING_CLIPS: 'Revisando candidatos',
  GENERATING_PREVIEWS: 'Gerando prévias',
  RENDERING_PREVIEW: 'Renderizando prévia',
  RENDERING_EXPORT: 'Renderizando exportação',
  BUILDING_BUNDLE: 'Preparando ZIP',
  UPLOADING_OUTPUT: 'Salvando resultado',
  GENERATING_COVER: 'Gerando capa',
  FINALIZING: 'Finalizando',
  DONE: 'Concluído',
};

function outputDuration(clip: Clip) {
  return clip.segments.reduce((total, segment) => total + segment.endMs - segment.startMs, 0);
}

function normalizeClip(clip: Clip): Clip {
  return {
    ...clip,
    segments: clip.segments?.length ? clip.segments : [{startMs: clip.startMs, endMs: clip.endMs}],
    captionPreset: clip.captionPreset || 'Clean',
    visualStyle: clip.visualStyle || 'Cinema',
    aspect: clip.aspect || '9:16',
    crop: clip.crop || {x: 0, y: 0, width: 1, height: 1},
    previewRevision: clip.previewRevision ?? 0,
  };
}

export default function ProjectPage({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params);
  const [project, setProject] = useState<Project>();
  const [progress, setProgress] = useState<ProjectProgress>();
  const [editorMeta, setEditorMeta] = useState<EditorMeta>();
  const [clips, setClips] = useState<Clip[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [exports, setExports] = useState<Export[]>([]);
  const [bundles, setBundles] = useState<{id: string; url: string}[]>([]);
  const [quantity, setQuantity] = useState(5);
  const [durationMode, setDuration] = useState('UP_TO_1_MIN');
  const [features, setFeatures] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>(['9:16']);
  const [modality, setModality] = useState('trial');
  const [exportFormat, setExportFormat] = useState('9:16');
  const [quote, setQuote] = useState<Quote>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rights, setRights] = useState(false);
  const [editorClipId, setEditorClipId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, Clip[]>>({});
  const [redo, setRedo] = useState<Record<string, Clip[]>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('Novo corte manual');
  const [manualStart, setManualStart] = useState(0);
  const [manualEnd, setManualEnd] = useState(30);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [covering, setCovering] = useState<string | null>(null);
  const [coverAt, setCoverAt] = useState(0);
  const coverVideoRef = useRef<HTMLVideoElement>(null);

  const editorClip = useMemo(
    () => clips.find(clip => clip.id === editorClipId),
    [clips, editorClipId],
  );

  const captionPresets = editorMeta?.captionPresets?.length ? editorMeta.captionPresets : fallbackCaptionPresets;
  const visualStyles = editorMeta?.visualStyles?.length ? editorMeta.visualStyles : fallbackVisualStyles;
  const aspects = editorMeta?.aspects?.length ? editorMeta.aspects : fallbackAspects;
  const maxSeconds = Math.max(1, Math.floor((project?.durationMs ?? 0) / 1000));

  async function loadRevisions(clipId: string) {
    try {
      setRevisions(await api<Revision[]>(`/clips/${clipId}/revisions`));
    } catch {
      setRevisions([]);
    }
  }

  async function refresh() {
    try {
      const [p, jobProgress, meta, rawClips, e, b] = await Promise.all([
        api<Project>('/projects/' + id),
        api<ProjectProgress>(`/projects/${id}/progress`),
        api<EditorMeta>(`/projects/${id}/editor`),
        api<Clip[]>(`/projects/${id}/clips`),
        api<Export[]>(`/projects/${id}/exports`),
        api<{id:string;url:string}[]>(`/projects/${id}/bundles`),
      ]);
      const normalized = rawClips.map(normalizeClip);
      setProject(p);
      setProgress(jobProgress);
      setEditorMeta(meta);
      setClips(normalized);
      setExports(e);
      setBundles(b);

      const selected = editorClipId && normalized.some(clip => clip.id === editorClipId)
        ? editorClipId
        : normalized[0]?.id ?? null;
      setEditorClipId(selected);
      if (selected) void loadRevisions(selected);
    } catch (error) {
      setMessage(friendly((error as Error).message));
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void api<Project>('/projects/' + id).then(setProject);
      void api<ProjectProgress>(`/projects/${id}/progress`).then(setProgress);
      void api<Export[]>(`/projects/${id}/exports`).then(setExports);
    }, 5000);
    return () => clearInterval(timer);
  }, [id]);

  useEffect(() => {
    const selected = clips.find(clip => clip.id === editorClipId);
    if (!selected) return;
    const seconds = Math.max(0, selected.startMs / 1000);
    setCoverAt(seconds);
    if (coverVideoRef.current && Number.isFinite(seconds)) {
      coverVideoRef.current.currentTime = seconds;
    }
  }, [editorClipId]);

  useEffect(() => {
    setQuote(undefined);
  }, [quantity, durationMode, features, formats, modality]);

  async function calculate() {
    setBusy(true);
    setMessage('');
    try {
      setQuote(await api<Quote>(
        `/projects/${id}/quotes`,
        'POST',
        {modality, configuration: {quantity, durationMode, style: 'BASIC', features, formats}},
      ));
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  function patchClip(clipId: string, patch: Partial<Clip>) {
    const current = clips.find(clip => clip.id === clipId);
    if (!current) return;

    setHistory(old => ({
      ...old,
      [clipId]: [...(old[clipId] ?? []), structuredClone(current)].slice(-30),
    }));
    setRedo(old => ({...old, [clipId]: []}));
    setClips(old => old.map(clip => clip.id === clipId ? {...clip, ...patch} : clip));
  }

  function patchSegments(clip: Clip, segments: Segment[]) {
    if (!segments.length) return;
    const ordered = [...segments].sort((a, b) => a.startMs - b.startMs);
    patchClip(clip.id, {
      segments: ordered,
      startMs: Math.min(...ordered.map(segment => segment.startMs)),
      endMs: Math.max(...ordered.map(segment => segment.endMs)),
    });
  }

  function updateSegment(clip: Clip, index: number, patch: Partial<Segment>) {
    const next = clip.segments.map((segment, position) => position === index ? {...segment, ...patch} : segment);
    patchSegments(clip, next);
  }

  function splitSegment(clip: Clip, index: number) {
    const segment = clip.segments[index];
    if (!segment || segment.endMs - segment.startMs < 400) return;
    const middle = Math.round((segment.startMs + segment.endMs) / 2);
    const next = [
      ...clip.segments.slice(0, index),
      {startMs: segment.startMs, endMs: middle},
      {startMs: middle, endMs: segment.endMs},
      ...clip.segments.slice(index + 1),
    ];
    patchSegments(clip, next);
  }

  function removeSegment(clip: Clip, index: number) {
    if (clip.segments.length <= 1) return;
    patchSegments(clip, clip.segments.filter((_, position) => position !== index));
  }

  function undoClip(clipId: string) {
    const stack = history[clipId] ?? [];
    if (!stack.length) return;
    const previous = stack[stack.length - 1];
    const current = clips.find(clip => clip.id === clipId);
    if (!current) return;

    setHistory(old => ({...old, [clipId]: stack.slice(0, -1)}));
    setRedo(old => ({...old, [clipId]: [...(old[clipId] ?? []), structuredClone(current)].slice(-30)}));
    setClips(old => old.map(clip => clip.id === clipId ? previous : clip));
  }

  function redoClip(clipId: string) {
    const stack = redo[clipId] ?? [];
    if (!stack.length) return;
    const next = stack[stack.length - 1];
    const current = clips.find(clip => clip.id === clipId);
    if (!current) return;

    setRedo(old => ({...old, [clipId]: stack.slice(0, -1)}));
    setHistory(old => ({...old, [clipId]: [...(old[clipId] ?? []), structuredClone(current)].slice(-30)}));
    setClips(old => old.map(clip => clip.id === clipId ? next : clip));
  }

  async function saveClip(clip: Clip, showMessage = true) {
    const result = await api<{revision: number}>(
      `/clips/${clip.id}/revisions`,
      'POST',
      {
        title: clip.title,
        selection: clip.selection,
        segments: clip.segments,
        subtitles: clip.subtitles,
        captionsEnabled: clip.style !== 'none',
        captionPreset: clip.captionPreset,
        visualStyle: clip.visualStyle,
        aspect: clip.aspect,
        crop: clip.crop,
      },
      {version: clip.revision},
    );

    setClips(old => old.map(item => item.id === clip.id ? {...item, revision: result.revision} : item));
    setHistory(old => ({...old, [clip.id]: []}));
    setRedo(old => ({...old, [clip.id]: []}));
    await loadRevisions(clip.id);
    if (showMessage) setMessage(`Revisão ${result.revision} salva sem nova cobrança.`);
    return result.revision;
  }

  async function restoreRevision(revision: Revision) {
    if (!editorClip || busy || revision.number === editorClip.revision) return;
    setBusy(true);
    setMessage('');

    try {
      const result = await api<{revision: number; restoredFrom: number}>(
        `/clips/${editorClip.id}/revisions/${revision.number}/restore`,
        'POST',
        {},
        {version: editorClip.revision},
      );

      setHistory(old => ({...old, [editorClip.id]: []}));
      setRedo(old => ({...old, [editorClip.id]: []}));
      await refresh();
      await loadRevisions(editorClip.id);
      setMessage(`Revisão ${result.restoredFrom} restaurada como nova revisão ${result.revision}.`);
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function createManualClip() {
    if (busy) return;
    setMessage('');

    if (!editorMeta?.masterAvailable) {
      setMessage(friendly('MASTER_EXPIRED'));
      return;
    }
    if (!manualTitle.trim() || manualEnd <= manualStart) {
      setMessage('Defina um título e um intervalo válido para o corte manual.');
      return;
    }

    setBusy(true);
    try {
      const result = await api<{id: string; revision: number}>(
        `/projects/${id}/clips/manual`,
        'POST',
        {
          title: manualTitle.trim(),
          segments: [{
            startMs: Math.round(manualStart * 1000),
            endMs: Math.round(manualEnd * 1000),
          }],
          aspect: '9:16',
          captionPreset: 'Clean',
          visualStyle: 'Cinema',
        },
      );

      setManualOpen(false);
      setMessage('Corte manual criado a partir do master, sem nova análise de IA.');
      await refresh();
      setEditorClipId(result.id);
      await loadRevisions(result.id);
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function requestPreview(clip: Clip) {
    if (previewing || busy) return;
    setPreviewing(clip.id);
    setMessage('');

    try {
      let revision = clip.revision;
      if ((history[clip.id]?.length ?? 0) > 0) {
        revision = await saveClip(clip, false);
      }

      await api(
        `/clips/${clip.id}/preview`,
        'POST',
      );

      setMessage(`Gerando prévia da revisão ${revision}…`);

      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const serverClips = (await api<Clip[]>(`/projects/${id}/clips`)).map(normalizeClip);
        const updated = serverClips.find(item => item.id === clip.id);
        if (!updated) break;

        if (updated.previewRevision >= revision) {
          setClips(current => current.map(item => item.id === clip.id
            ? {...item, preview: updated.preview, cover: updated.cover, previewRevision: updated.previewRevision}
            : item));
          setMessage(`Prévia da revisão ${revision} pronta.`);
          return;
        }
      }

      setMessage('A prévia continua processando. Você pode continuar editando e atualizar novamente em instantes.');
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setPreviewing(null);
    }
  }

  async function requestCover(clip: Clip) {
    if (covering || previewing || busy || !editorMeta?.masterUrl) return;
    setCovering(clip.id);
    setMessage('');

    try {
      let revision = clip.revision;
      if ((history[clip.id]?.length ?? 0) > 0) {
        revision = await saveClip(clip, false);
      }

      await api(
        `/clips/${clip.id}/cover`,
        'POST',
        {atMs: Math.round(coverAt * 1000)},
        {version: revision},
      );

      setMessage(`Gerando capa no ponto ${coverAt.toFixed(1)}s…`);

      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const serverClips = (await api<Clip[]>(`/projects/${id}/clips`)).map(normalizeClip);
        const updated = serverClips.find(item => item.id === clip.id);
        if (!updated) break;

        if (updated.revision > revision && updated.cover) {
          setClips(current => current.map(item => item.id === clip.id ? updated : item));
          setHistory(old => ({...old, [clip.id]: []}));
          setRedo(old => ({...old, [clip.id]: []}));
          await loadRevisions(clip.id);
          setMessage(`Capa salva como revisão ${updated.revision}.`);
          return;
        }
      }

      setMessage('A capa continua sendo gerada. O processamento segue no servidor.');
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setCovering(null);
    }
  }

  async function requestExport(clip: Clip) {
    setBusy(true);
    setMessage('');
    try {
      if ((history[clip.id]?.length ?? 0) > 0) {
        await saveClip(clip, false);
      }

      await api(
        `/projects/${id}/exports`,
        'POST',
        {clipId: clip.id, format: exportFormat},
        {key: key()},
      );

      setMessage(`Renderização ${exportFormat} solicitada para a revisão atual.`);
      await refresh();
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <nav>
        <Link className="brand" href="/app">slice<span>flow</span></Link>
        <Link href="/app">← Seus projetos</Link>
      </nav>

      <main className="workspace project-workspace">
        <section className="project-header">
          <div>
            <p className="eyebrow">{project?.status ?? 'CARREGANDO'}</p>
            <h1>{project?.title || 'Carregando…'}</h1>
            <p>{Math.ceil((project?.durationMs || 0) / 60000)} minutos de conteúdo</p>
          </div>
          <div className="project-header-actions">
            <button
              className="secondary"
              disabled={!editorMeta?.capabilities.manualCuts || !editorMeta?.masterAvailable}
              onClick={() => setManualOpen(value => !value)}
            >
              + Criar corte manual
            </button>
            <button className="secondary" onClick={refresh}>Atualizar</button>
          </div>
        </section>

        {progress?.active && progress.job && (
          <section className="job-progress-card" aria-live="polite">
            <div className="job-progress-copy">
              <div>
                <p className="eyebrow">PROCESSAMENTO EM ANDAMENTO</p>
                <strong>{progressLabels[progress.job.progressPhase] ?? progress.job.progressPhase}</strong>
              </div>
              <span>{progress.job.progressPercent}%</span>
            </div>
            <progress max={100} value={progress.job.progressPercent} />
            <small>{progress.job.stage} · você pode sair desta página; o processamento continua no servidor.</small>
          </section>
        )}

        {project?.outcome === 'NO_SUITABLE_CLIPS' && (
          <p className="notice">{friendly('NO_SUITABLE_CLIPS')}</p>
        )}

        {manualOpen && (
          <section className="manual-cut-shell">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CORTE MANUAL</p>
                <h2>Escolha qualquer trecho do master.</h2>
              </div>
              <span>Sem nova análise de IA</span>
            </div>

            <div className="manual-cut-grid">
              <label>
                Título
                <input value={manualTitle} maxLength={200} onChange={event => setManualTitle(event.target.value)} />
              </label>
              <label>
                Início (s)
                <input type="number" min={0} max={maxSeconds} step=".1" value={manualStart} onChange={event => setManualStart(Number(event.target.value))} />
              </label>
              <label>
                Fim (s)
                <input type="number" min={0} max={maxSeconds} step=".1" value={manualEnd} onChange={event => setManualEnd(Number(event.target.value))} />
              </label>
            </div>

            <div className="manual-timeline" aria-label="Intervalo do corte manual">
              <span style={{left: `${Math.min(100, manualStart / maxSeconds * 100)}%`}} />
              <span style={{left: `${Math.min(100, manualEnd / maxSeconds * 100)}%`}} />
            </div>

            <div className="manual-cut-actions">
              <button disabled={busy} onClick={() => void createManualClip()}>Criar corte</button>
              <button className="secondary" disabled={busy} onClick={() => setManualOpen(false)}>Cancelar</button>
            </div>
          </section>
        )}

        <section className="config project-config">
          <div className="section-heading">
            <div><p className="eyebrow">PROCESSAMENTO</p><h2>Prepare sua execução</h2></div>
          </div>

          <div className="grid">
            <label>Quantidade<input type="number" min={1} max={20} value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label>
            <label>Duração<select value={durationMode} onChange={event => setDuration(event.target.value)}><option value="UP_TO_1_MIN">Até 1 minuto</option><option value="ONE_TO_TWO_MIN">1 a 2 minutos</option><option value="TWO_TO_THREE_MIN">2 a 3 minutos</option><option value="AUTO">Automático</option></select></label>
            <label>Modalidade<select value={modality} onChange={event => setModality(event.target.value)}><option value="trial">Teste gratuito — Terra</option><option value="paid">Créditos comprados — Sol</option></select></label>
          </div>

          <div className="extras">
            {extras.map(([code, title, price]) => (
              <label className="check" key={code}>
                <input
                  type="checkbox"
                  disabled={(code === 'dynamic_captions' && !editorMeta?.capabilities.dynamicCaptions) || (code === 'tracking' && !editorMeta?.capabilities.intelligentReframe)}
                  checked={features.includes(code)}
                  onChange={event => setFeatures(current => event.target.checked ? [...current, code] : current.filter(item => item !== code))}
                />
                {title} <small>{(code === 'dynamic_captions' && !editorMeta?.capabilities.dynamicCaptions) || (code === 'tracking' && !editorMeta?.capabilities.intelligentReframe) ? 'indisponível neste ambiente' : `+${price}`}</small>
              </label>
            ))}
          </div>
          <p>Extras cobrados uma vez por execução, nunca por corte.</p>

          <div className="extras">
            {fallbackAspects.map(format => (
              <label className="check" key={format}>
                <input
                  type="checkbox"
                  checked={formats.includes(format)}
                  onChange={event => setFormats(current => event.target.checked ? [...current, format] : current.filter(item => item !== format))}
                />
                {format}
              </label>
            ))}
          </div>

          <button disabled={busy || !project?.durationMs || !formats.length} onClick={calculate}>Calcular créditos</button>

          {quote && (
            <article className="quote">
              {quote.items.map(item => <div key={item.code}><span>{item.description}</span><b>{item.credits}</b></div>)}
              <hr />
              <div><span>Total</span><b>{quote.total}</b></div>
              <p>Saldo: {quote.balance} → após operação: {quote.balanceAfter}</p>
              <label className="check">
                <input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} />
                Tenho autorização para processar este conteúdo.
              </label>
              <button
                disabled={busy || !rights || quote.balanceAfter < 0}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/projects/${id}/runs`, 'POST', {quoteId: quote.id, rightsAccepted: true}, {key: key()});
                    setQuote(undefined);
                    setMessage('Processamento iniciado. Você pode sair desta página.');
                    await refresh();
                  } catch (error) {
                    setMessage(friendly((error as Error).message));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Gerar cortes por {quote.total} créditos
              </button>
            </article>
          )}
        </section>

        {message && <p role="status" className="notice dashboard-notice">{message}</p>}

        <section className="editor-shell">
          <div className="editor-sidebar">
            <div className="section-heading">
              <div><p className="eyebrow">CORTES</p><h2>Selecione para editar</h2></div>
            </div>

            <button
              className="secondary editor-alt-button"
              onClick={async () => {
                try {
                  await api(`/projects/${id}/alternatives`, 'POST', {});
                  setMessage('Buscando outros trechos a partir da análise e do master.');
                } catch (error) {
                  setMessage(friendly((error as Error).message));
                }
              }}
            >
              Buscar outros cortes
            </button>

            <div className="editor-clip-list">
              {clips.map((clip, index) => (
                <button
                  key={clip.id}
                  className={editorClipId === clip.id ? 'active' : ''}
                  onClick={() => {
                    setEditorClipId(clip.id);
                    setExportFormat(clip.aspect || '9:16');
                    void loadRevisions(clip.id);
                  }}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{clip.title}</strong>
                    <small>{Math.round(outputDuration(clip) / 1000)}s · rev. {clip.revision} · {clip.selection}</small>
                  </div>
                </button>
              ))}
              {!clips.length && <p>Os cortes sugeridos aparecerão aqui quando a análise terminar.</p>}
            </div>

            {!!revisions.length && (
              <div className="revision-history">
                <small>HISTÓRICO</small>
                {revisions.slice(0, 8).map(revision => (
                  <div className="revision-history-row" key={revision.id}>
                    <div>
                      <span>Rev. {revision.number}</span>
                      <time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString('pt-BR')}</time>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || !editorClip || revision.number === editorClip.revision}
                      onClick={() => void restoreRevision(revision)}
                    >
                      {editorClip && revision.number === editorClip.revision ? 'Atual' : 'Restaurar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="editor-main">
            {!editorClip && (
              <div className="editor-empty">
                <strong>Escolha um corte para abrir o editor.</strong>
                <p>Você poderá ajustar segmentos, legenda, visual, crop e exportação.</p>
              </div>
            )}

            {editorClip && (
              <>
                <div className="editor-topbar">
                  <div>
                    <p className="eyebrow">EDITOR SHORT-FORM · REV. {editorClip.revision}</p>
                    <h2>{editorClip.title}</h2>
                    <div className="preview-revision-state">
                      {editorClip.previewRevision >= editorClip.revision
                        ? <span className="current">Prévia atualizada · rev. {editorClip.previewRevision}</span>
                        : <span className="stale">Prévia desatualizada · rev. {editorClip.previewRevision || '—'}</span>}
                    </div>
                  </div>
                  <div className="editor-history">
                    <button className="secondary" disabled={!(history[editorClip.id]?.length)} onClick={() => undoClip(editorClip.id)}>↶ Desfazer</button>
                    <button className="secondary" disabled={!(redo[editorClip.id]?.length)} onClick={() => redoClip(editorClip.id)}>↷ Refazer</button>
                  </div>
                </div>

                <div className="editor-stage-grid">
                  <div className={`editor-video mood-${editorClip.visualStyle.toLowerCase()}`}>
                    {editorClip.preview
                      ? <video controls preload="metadata" src={editorClip.preview} poster={editorClip.cover} />
                      : <div className="editor-placeholder"><span className="preview-person" /><strong>Prévia do corte</strong></div>}
                    {editorClip.style !== 'none' && (
                      <div className={`editor-caption-preview caption-preview-${editorClip.captionPreset.toLowerCase().replace(/\s+/g, '-')}`}>
                        A IA cria. <b>Você ajusta.</b>
                      </div>
                    )}
                  </div>

                  <aside className="editor-inspector">
                    <label>Título<input value={editorClip.title} maxLength={200} onChange={event => patchClip(editorClip.id, {title: event.target.value})} /></label>
                    <label>Escolha<select value={editorClip.selection} onChange={event => patchClip(editorClip.id, {selection: event.target.value})}><option value="SUGGESTED">Sugestão</option><option value="SELECTED">Selecionado</option><option value="REJECTED">Descartado</option></select></label>
                    <label>Legenda<select value={editorClip.style} onChange={event => patchClip(editorClip.id, {style: event.target.value})}><option value="simple">Ativada</option><option value="none">Desativada</option></select></label>
                    <label>Formato<select value={exportFormat} onChange={event => {setExportFormat(event.target.value);patchClip(editorClip.id, {aspect: event.target.value});}}>{aspects.map(format => <option key={format}>{format}</option>)}</select></label>

                    <fieldset className="crop-fields">
                      <legend>Crop manual</legend>
                      {(['x','y','width','height'] as const).map(field => (
                        <label key={field}>
                          {field.toUpperCase()}
                          <input
                            type="number"
                            min={field === 'width' || field === 'height' ? 0.01 : 0}
                            max={1}
                            step=".01"
                            value={editorClip.crop[field]}
                            onChange={event => patchClip(editorClip.id, {
                              crop: {...editorClip.crop, [field]: Number(event.target.value)},
                            })}
                          />
                        </label>
                      ))}
                    </fieldset>
                  </aside>
                </div>

                <div className="timeline-editor">
                  <div className="timeline-heading">
                    <strong>Timeline não destrutiva</strong>
                    <span>{(outputDuration(editorClip) / 1000).toFixed(1)}s no resultado · {editorClip.segments.length} segmento(s)</span>
                  </div>

                  <div className="segment-editor-list">
                    {editorClip.segments.map((segment, index) => (
                      <div className="segment-editor-row" key={index}>
                        <b>Trecho {index + 1}</b>
                        <label>Início<input type="number" step=".1" min={0} max={maxSeconds} value={segment.startMs / 1000} onChange={event => updateSegment(editorClip, index, {startMs: Math.round(Number(event.target.value) * 1000)})} /></label>
                        <label>Fim<input type="number" step=".1" min={0} max={maxSeconds} value={segment.endMs / 1000} onChange={event => updateSegment(editorClip, index, {endMs: Math.round(Number(event.target.value) * 1000)})} /></label>
                        <button className="secondary" type="button" onClick={() => splitSegment(editorClip, index)}>Dividir</button>
                        <button className="secondary" type="button" disabled={editorClip.segments.length <= 1} onClick={() => removeSegment(editorClip, index)}>Remover</button>
                      </div>
                    ))}
                  </div>

                  <div className="timeline-strip">
                    {editorClip.segments.map((segment, index) => (
                      <span
                        key={index}
                        title={`Trecho ${index + 1}`}
                        style={{
                          left: `${segment.startMs / Math.max(1, project?.durationMs ?? 1) * 100}%`,
                          width: `${Math.max(.5, (segment.endMs - segment.startMs) / Math.max(1, project?.durationMs ?? 1) * 100)}%`,
                        }}
                      />
                    ))}
                  </div>
                  <small>Dividir e remover trechos alteram apenas a revisão do corte; o vídeo master permanece intacto.</small>
                </div>

                <div className="editor-panels">
                  <section>
                    <div className="section-heading"><div><p className="eyebrow">LEGENDA</p><h3>Texto e sincronismo</h3></div></div>
                    <div className="subtitle-editor-list">
                      {editorClip.subtitles.map((subtitle, index) => (
                        <label key={index}>
                          <span>{(subtitle.startMs / 1000).toFixed(1)}s</span>
                          <textarea
                            value={subtitle.text}
                            onChange={event => patchClip(editorClip.id, {
                              subtitles: editorClip.subtitles.map((item, position) => position === index ? {...item, text: event.target.value, words: undefined} : item),
                            })}
                          />
                        </label>
                      ))}
                      {!editorClip.subtitles.length && <p>Nenhuma legenda disponível neste corte ainda.</p>}
                    </div>
                    <small>Correções de texto e sincronismo ficam na revisão e não disparam nova análise de IA.</small>
                  </section>

                  <section>
                    <div className="section-heading"><div><p className="eyebrow">ESTILO DA LEGENDA</p><h3>Escolha um preset</h3></div></div>
                    <div className="editor-preset-grid">
                      {captionPresets.map(preset => (
                        <button
                          type="button"
                          key={preset}
                          className={editorClip.captionPreset === preset ? 'active' : ''}
                          onClick={() => patchClip(editorClip.id, {captionPreset: preset})}
                        >
                          <small>{preset}</small><b>PALAVRA</b>
                        </button>
                      ))}
                    </div>
                    <small>O preset escolhido é salvo na revisão e usado pelo render final.</small>
                  </section>

                  <section>
                    <div className="section-heading"><div><p className="eyebrow">ESTILO VISUAL</p><h3>Tipo de filme</h3></div></div>
                    <div className="editor-mood-grid">
                      {visualStyles.map(mood => (
                        <button
                          type="button"
                          key={mood}
                          className={editorClip.visualStyle === mood ? 'active' : ''}
                          onClick={() => patchClip(editorClip.id, {visualStyle: mood})}
                        >
                          <span className={`mood-swatch mood-${mood.toLowerCase()}`} />
                          <b>{mood}</b>
                        </button>
                      ))}
                    </div>
                    <small>Os estilos são allowlisted no backend e renderizados deterministicamente pelo FFmpeg.</small>
                  </section>

                  <section className="cover-editor-panel">
                    <div className="section-heading">
                      <div><p className="eyebrow">CAPA</p><h3>Escolha um frame do master</h3></div>
                      <span>{coverAt.toFixed(1)}s</span>
                    </div>

                    {editorMeta?.masterUrl ? (
                      <>
                        <div className="cover-master-grid">
                          <div className="cover-master-video">
                            <video
                              ref={coverVideoRef}
                              src={editorMeta.masterUrl}
                              controls
                              preload="metadata"
                              onLoadedMetadata={event => {
                                const target = Math.min(coverAt, event.currentTarget.duration || coverAt);
                                if (Number.isFinite(target)) event.currentTarget.currentTime = target;
                              }}
                              onTimeUpdate={event => {
                                if (!event.currentTarget.seeking && !event.currentTarget.paused) {
                                  setCoverAt(event.currentTarget.currentTime);
                                }
                              }}
                              onSeeked={event => setCoverAt(event.currentTarget.currentTime)}
                            />
                          </div>
                          <div className="cover-current">
                            <small>CAPA ATUAL</small>
                            {editorClip.cover
                              ? <img src={editorClip.cover} alt="Capa atual do corte" />
                              : <div className="cover-empty">Nenhuma capa escolhida</div>}
                          </div>
                        </div>

                        <label className="cover-scrubber">
                          Ponto do vídeo
                          <input
                            type="range"
                            min={0}
                            max={Math.max(.1, (project?.durationMs ?? 0) / 1000)}
                            step=".1"
                            value={coverAt}
                            onChange={event => {
                              const next = Number(event.target.value);
                              setCoverAt(next);
                              if (coverVideoRef.current) coverVideoRef.current.currentTime = next;
                            }}
                          />
                        </label>

                        <div className="cover-actions">
                          <label>
                            Segundo exato
                            <input
                              type="number"
                              min={0}
                              max={maxSeconds}
                              step=".1"
                              value={Number(coverAt.toFixed(1))}
                              onChange={event => {
                                const next = Math.max(0, Math.min(maxSeconds, Number(event.target.value)));
                                setCoverAt(next);
                                if (coverVideoRef.current) coverVideoRef.current.currentTime = next;
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={busy || previewing === editorClip.id || covering === editorClip.id}
                            onClick={() => void requestCover(editorClip)}
                          >
                            {covering === editorClip.id ? 'Gerando capa…' : 'Usar este frame como capa'}
                          </button>
                        </div>
                        <small>A capa é extraída do vídeo master e salva como uma nova revisão. Não há nova análise de IA.</small>
                      </>
                    ) : (
                      <p>O master não está mais disponível para escolher outra capa.</p>
                    )}
                  </section>
                </div>

                <div className="editor-actions">
                  <button
                    disabled={busy || !(history[editorClip.id]?.length)}
                    onClick={async () => {
                      setBusy(true);
                      setMessage('');
                      try {
                        await saveClip(editorClip);
                      } catch (error) {
                        setMessage(friendly((error as Error).message));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Salvar nova revisão
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || previewing === editorClip.id}
                    onClick={() => void requestPreview(editorClip)}
                  >
                    {previewing === editorClip.id ? 'Gerando prévia…' : 'Atualizar prévia'}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || previewing === editorClip.id || editorClip.selection !== 'SELECTED'}
                    onClick={() => void requestExport(editorClip)}
                  >
                    Exportar {exportFormat}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <div className="section-heading"><div><p className="eyebrow">ARQUIVOS</p><h2>Exportações</h2></div></div>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await api(`/projects/${id}/bundle`, 'POST', {});
                setMessage('ZIP solicitado. Atualize em instantes para baixar.');
              } catch (error) {
                setMessage(friendly((error as Error).message));
              }
            }}
          >
            Preparar ZIP
          </button>
          <div className="export-list">
            {bundles.map(bundle => <a className="button" key={bundle.id} href={bundle.url}>Baixar ZIP</a>)}
            {exports.map(item => (
              <article className="row" key={item.id}>
                <span>{item.format} · rev. {item.revision} · {item.state}</span>
                {item.url && <a className="button" href={item.url} target="_blank" rel="noreferrer">Baixar vídeo</a>}
              </article>
            ))}
          </div>
        </section>

        <button
          className="danger"
          onClick={async () => {
            if (confirm('Excluir este projeto e seus arquivos?')) {
              await api('/projects/' + id, 'DELETE');
              window.location.href = '/app';
            }
          }}
        >
          Excluir projeto
        </button>
      </main>
    </>
  );
}
