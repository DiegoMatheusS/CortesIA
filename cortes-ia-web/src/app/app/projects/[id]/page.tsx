'use client';

import {use, useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {api, friendly, key} from '@/lib/api';

type Subtitle = {startMs: number; endMs: number; text: string};
type Clip = {
  id: string;
  title: string;
  reason: string;
  startMs: number;
  endMs: number;
  selection: string;
  revision: number;
  style: string;
  subtitles: Subtitle[];
  preview?: string;
  cover?: string;
};
type Project = {id: string; title: string; status: string; outcome?: string; durationMs: number};
type Quote = {
  id: string;
  total: number;
  balance: number;
  balanceAfter: number;
  items: {code: string; description: string; credits: number}[];
};
type Export = {id: string; clipId: string; format: string; state: string; url?: string};

const extras = [
  ['dynamic_captions', 'Legenda dinâmica', 3],
  ['zoom', 'Zoom automático', 2],
  ['blur', 'Fundo borrado', 3],
  ['tracking', 'Enquadramento inteligente', 2],
  ['cover', 'Capa automática', 2],
] as const;

const captionPresets = ['Clean','Bold','Viral','Podcast','Karaoke','Pop','Minimal','Box','News','Dark','Neon','Impacto','Emoji','Classic','Creator'];
const visualMoods = ['Cinema','Divertido','Animado','Sombrio','Quente','Frio'];

export default function ProjectPage({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params);
  const [project, setProject] = useState<Project>();
  const [clips, setClips] = useState<Clip[]>([]);
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
  const [captionPreset, setCaptionPreset] = useState<Record<string,string>>({});
  const [visualMood, setVisualMood] = useState<Record<string,string>>({});
  const [history, setHistory] = useState<Record<string, Clip[]>>({});
  const [redo, setRedo] = useState<Record<string, Clip[]>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('Novo corte manual');
  const [manualStart, setManualStart] = useState(0);
  const [manualEnd, setManualEnd] = useState(30);

  const editorClip = useMemo(
    () => clips.find(clip => clip.id === editorClipId),
    [clips, editorClipId],
  );

  async function refresh() {
    try {
      const [p, c, e, b] = await Promise.all([
        api<Project>('/projects/' + id),
        api<Clip[]>(`/projects/${id}/clips`),
        api<Export[]>(`/projects/${id}/exports`),
        api<{id:string;url:string}[]>(`/projects/${id}/bundles`),
      ]);
      setProject(p);
      setClips(c);
      setExports(e);
      setBundles(b);
      if (!editorClipId && c.length) setEditorClipId(c[0].id);
    } catch (error) {
      setMessage(friendly((error as Error).message));
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void api<Project>('/projects/' + id).then(setProject);
      void api<Export[]>(`/projects/${id}/exports`).then(setExports);
    }, 5000);
    return () => clearInterval(timer);
  }, [id]);

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
      [clipId]: [...(old[clipId] ?? []), current].slice(-30),
    }));
    setRedo(old => ({...old, [clipId]: []}));
    setClips(old => old.map(clip => clip.id === clipId ? {...clip, ...patch} : clip));
  }

  function undoClip(clipId: string) {
    const stack = history[clipId] ?? [];
    if (!stack.length) return;
    const previous = stack[stack.length - 1];
    const current = clips.find(clip => clip.id === clipId);
    if (!current) return;

    setHistory(old => ({...old, [clipId]: stack.slice(0, -1)}));
    setRedo(old => ({...old, [clipId]: [...(old[clipId] ?? []), current].slice(-30)}));
    setClips(old => old.map(clip => clip.id === clipId ? previous : clip));
  }

  function redoClip(clipId: string) {
    const stack = redo[clipId] ?? [];
    if (!stack.length) return;
    const next = stack[stack.length - 1];
    const current = clips.find(clip => clip.id === clipId);
    if (!current) return;

    setRedo(old => ({...old, [clipId]: stack.slice(0, -1)}));
    setHistory(old => ({...old, [clipId]: [...(old[clipId] ?? []), current].slice(-30)}));
    setClips(old => old.map(clip => clip.id === clipId ? next : clip));
  }

  async function saveClip(clip: Clip) {
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{revision: number}>(
        '/clips/' + clip.id,
        'PUT',
        {
          title: clip.title,
          startMs: clip.startMs,
          endMs: clip.endMs,
          selection: clip.selection,
          subtitles: clip.subtitles,
          style: clip.style,
        },
        {version: clip.revision},
      );

      setClips(old => old.map(item => item.id === clip.id ? {...item, revision: result.revision} : item));
      setHistory(old => ({...old, [clip.id]: []}));
      setRedo(old => ({...old, [clip.id]: []}));
      setMessage('Alterações do corte salvas sem nova cobrança.');
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function requestExport(clip: Clip) {
    setBusy(true);
    setMessage('');
    try {
      await api(
        '/clips/' + clip.id,
        'PUT',
        {
          title: clip.title,
          startMs: clip.startMs,
          endMs: clip.endMs,
          selection: clip.selection,
          subtitles: clip.subtitles,
          style: clip.style,
        },
        {version: clip.revision},
      );

      await api(
        `/projects/${id}/exports`,
        'POST',
        {clipId: clip.id, format: exportFormat},
        {key: key()},
      );

      setMessage('Renderização solicitada sem cobrança duplicada.');
      await refresh();
    } catch (error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const maxSeconds = Math.max(1, Math.floor((project?.durationMs ?? 0) / 1000));

  return (
    <>
      <nav>
        <Link className="brand" href="/app">cortes<span>ia</span></Link>
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
            <button className="secondary" onClick={() => setManualOpen(value => !value)}>+ Criar corte manual</button>
            <button className="secondary" onClick={refresh}>Atualizar</button>
          </div>
        </section>

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
              <span>Interface v0.5 preparada</span>
            </div>
            <div className="manual-cut-grid">
              <label>
                Título
                <input value={manualTitle} onChange={event => setManualTitle(event.target.value)} />
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
            <div className="manual-timeline" aria-label="Prévia da timeline do corte manual">
              <span style={{left: `${Math.min(100, manualStart / maxSeconds * 100)}%`}} />
              <span style={{left: `${Math.min(100, manualEnd / maxSeconds * 100)}%`}} />
            </div>
            <p className="dev-note">A criação manual já está desenhada no frontend. A persistência desse novo corte será conectada quando o endpoint v0.5 do master entrar no backend.</p>
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
                  disabled={code === 'dynamic_captions' || code === 'tracking'}
                  checked={features.includes(code)}
                  onChange={event => setFeatures(current => event.target.checked ? [...current, code] : current.filter(item => item !== code))}
                />
                {title} <small>{code === 'dynamic_captions' || code === 'tracking' ? 'em implementação' : `+${price}`}</small>
              </label>
            ))}
          </div>
          <p>Extras cobrados uma vez por execução, nunca por corte.</p>

          <div className="extras">
            {['9:16','4:5','1:1','16:9','original'].map(format => (
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
                  onClick={() => setEditorClipId(clip.id)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{clip.title}</strong><small>{Math.round((clip.endMs - clip.startMs) / 1000)}s · {clip.selection}</small></div>
                </button>
              ))}
              {!clips.length && <p>Os cortes sugeridos aparecerão aqui quando a análise terminar.</p>}
            </div>
          </div>

          <div className="editor-main">
            {!editorClip && (
              <div className="editor-empty">
                <strong>Escolha um corte para abrir o editor.</strong>
                <p>Você poderá ajustar início, fim, título, legenda e exportação.</p>
              </div>
            )}

            {editorClip && (
              <>
                <div className="editor-topbar">
                  <div>
                    <p className="eyebrow">EDITOR SHORT-FORM</p>
                    <h2>{editorClip.title}</h2>
                  </div>
                  <div className="editor-history">
                    <button className="secondary" disabled={!(history[editorClip.id]?.length)} onClick={() => undoClip(editorClip.id)}>↶ Desfazer</button>
                    <button className="secondary" disabled={!(redo[editorClip.id]?.length)} onClick={() => redoClip(editorClip.id)}>↷ Refazer</button>
                  </div>
                </div>

                <div className="editor-stage-grid">
                  <div className={`editor-video mood-${(visualMood[editorClip.id] || 'Cinema').toLowerCase()}`}>
                    {editorClip.preview
                      ? <video controls preload="metadata" src={editorClip.preview} poster={editorClip.cover} />
                      : <div className="editor-placeholder"><span className="preview-person" /><strong>Prévia do corte</strong></div>}
                    {editorClip.style !== 'none' && <div className="editor-caption-preview">A IA cria. <b>Você ajusta.</b></div>}
                  </div>

                  <aside className="editor-inspector">
                    <label>Título<input value={editorClip.title} onChange={event => patchClip(editorClip.id, {title: event.target.value})} /></label>
                    <label>Escolha<select value={editorClip.selection} onChange={event => patchClip(editorClip.id, {selection: event.target.value})}><option value="SUGGESTED">Sugestão</option><option value="SELECTED">Selecionado</option><option value="REJECTED">Descartado</option></select></label>
                    <label>Legenda<select value={editorClip.style} onChange={event => patchClip(editorClip.id, {style: event.target.value})}><option value="simple">Ativada</option><option value="none">Desativada</option></select></label>
                    <label>Formato de exportação<select value={exportFormat} onChange={event => setExportFormat(event.target.value)}>{['9:16','4:5','1:1','16:9','original'].map(format => <option key={format}>{format}</option>)}</select></label>
                  </aside>
                </div>

                <div className="timeline-editor">
                  <div className="timeline-heading"><strong>Timeline</strong><span>{(editorClip.startMs / 1000).toFixed(1)}s → {(editorClip.endMs / 1000).toFixed(1)}s</span></div>
                  <div className="timeline-rulers">
                    <input
                      aria-label="Início do corte"
                      type="range"
                      min={0}
                      max={maxSeconds}
                      step=".1"
                      value={editorClip.startMs / 1000}
                      onChange={event => {
                        const next = Number(event.target.value) * 1000;
                        if (next < editorClip.endMs) patchClip(editorClip.id, {startMs: next});
                      }}
                    />
                    <input
                      aria-label="Fim do corte"
                      type="range"
                      min={0}
                      max={maxSeconds}
                      step=".1"
                      value={editorClip.endMs / 1000}
                      onChange={event => {
                        const next = Number(event.target.value) * 1000;
                        if (next > editorClip.startMs) patchClip(editorClip.id, {endMs: next});
                      }}
                    />
                  </div>
                  <div className="timeline-numbers">
                    <label>Início<input type="number" step=".1" value={editorClip.startMs / 1000} onChange={event => patchClip(editorClip.id, {startMs: Number(event.target.value) * 1000})} /></label>
                    <label>Fim<input type="number" step=".1" value={editorClip.endMs / 1000} onChange={event => patchClip(editorClip.id, {endMs: Number(event.target.value) * 1000})} /></label>
                  </div>
                  <div className="timeline-tools"><button className="secondary" disabled>Dividir</button><button className="secondary" disabled>Remover trecho</button><small>Essas operações aguardam o endpoint de segmentos da v0.5.</small></div>
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
                              subtitles: editorClip.subtitles.map((item, position) => position === index ? {...item, text: event.target.value} : item),
                            })}
                          />
                        </label>
                      ))}
                    </div>
                    <small>Correções de texto permanecem dentro da revisão atual e não geram nova cobrança.</small>
                  </section>

                  <section>
                    <div className="section-heading"><div><p className="eyebrow">ESTILO DA LEGENDA</p><h3>Escolha um preset</h3></div></div>
                    <div className="editor-preset-grid">
                      {captionPresets.map(preset => (
                        <button
                          type="button"
                          key={preset}
                          className={(captionPreset[editorClip.id] || 'Clean') === preset ? 'active' : ''}
                          onClick={() => setCaptionPreset(current => ({...current, [editorClip.id]: preset}))}
                        >
                          <small>{preset}</small><b>PALAVRA</b>
                        </button>
                      ))}
                    </div>
                    <small>Os presets completos já estão no frontend; a persistência será ligada ao contrato v0.5.</small>
                  </section>

                  <section>
                    <div className="section-heading"><div><p className="eyebrow">ESTILO VISUAL</p><h3>Tipo de filme</h3></div></div>
                    <div className="editor-mood-grid">
                      {visualMoods.map(mood => (
                        <button
                          type="button"
                          key={mood}
                          className={(visualMood[editorClip.id] || 'Cinema') === mood ? 'active' : ''}
                          onClick={() => setVisualMood(current => ({...current, [editorClip.id]: mood}))}
                        >
                          <span className={`mood-swatch mood-${mood.toLowerCase()}`} />
                          <b>{mood}</b>
                        </button>
                      ))}
                    </div>
                    <small>O preset visual altera apenas a apresentação da prévia; não muda fala nem significado.</small>
                  </section>
                </div>

                <div className="editor-actions">
                  <button disabled={busy} onClick={() => void saveClip(editorClip)}>Salvar edição</button>
                  <button
                    className="secondary"
                    disabled={busy || editorClip.selection !== 'SELECTED'}
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
                <span>{item.format} · {item.state}</span>
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
