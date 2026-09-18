'use client';

import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import NotificationBell from '@/components/NotificationBell';
import {api,friendly} from '@/lib/api';

type Ticket={id:string;projectId?:string|null;subject:string;message:string;status:string;reply?:string|null;createdAt:string};
type Project={id:string;title:string;status:string};

const statusLabel:Record<string,string>={OPEN:'Aberto',IN_REVIEW:'Em análise',ANSWERED:'Respondido',RESOLVED:'Resolvido'};

export default function SupportPage(){
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [projects,setProjects]=useState<Project[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(){
    try{
      const [ticketList,projectList]=await Promise.all([api<Ticket[]>('/tickets'),api<Project[]>('/projects')]);
      setTickets(ticketList);setProjects(projectList);
    }catch(error){
      const code=(error as Error).message;
      if(code==='UNAUTHORIZED'||code==='HTTP 401')location.href='/login';
      else setMessage(friendly(code));
    }
  }

  useEffect(()=>{void load();},[]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const projectId=String(form.get('projectId')||'').trim();
    try{
      await api('/tickets','POST',{
        subject:String(form.get('subject')||'').trim(),
        message:String(form.get('message')||'').trim(),
        projectId:projectId||null,
      });
      event.currentTarget.reset();
      setMessage('Chamado aberto com sucesso.');
      await load();
    }catch(error){setMessage(friendly((error as Error).message));}
    finally{setBusy(false);}
  }

  async function reopen(id:string){
    if(busy)return;setBusy(true);setMessage('');
    try{
      await api('/tickets/'+id+'/reopen','POST',{});
      setMessage('Chamado reaberto.');
      await load();
    }catch(error){setMessage(friendly((error as Error).message));}
    finally{setBusy(false);}
  }

  return <>
    <nav>
      <Link className="brand" href="/app">slice<span>flow</span></Link>
      <div><NotificationBell/><Link href="/app/credits">Créditos</Link><Link href="/app/account">Conta</Link><Link href="/app">← Dashboard</Link></div>
    </nav>
    <main className="workspace support-page">
      <section className="account-hero">
        <div><p className="eyebrow">SUPORTE</p><h1>Central de ajuda</h1><p>Abra um chamado, vincule um projeto e acompanhe a resposta da equipe.</p></div>
        <div className="support-summary"><strong>{tickets.filter(x=>x.status!=='RESOLVED').length}</strong><span>chamado(s) em andamento</span></div>
      </section>

      {message&&<p role="status" className="notice dashboard-notice">{message}</p>}

      <div className="support-layout">
        <section className="account-card">
          <p className="eyebrow">NOVO CHAMADO</p><h2>Como podemos ajudar?</h2>
          <form onSubmit={submit}>
            <label>Assunto<input name="subject" maxLength={200} placeholder="Ex.: problema ao exportar um corte" required/></label>
            <label>Projeto relacionado
              <select name="projectId" defaultValue="">
                <option value="">Nenhum / assunto geral</option>
                {projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}
              </select>
            </label>
            <label>Mensagem<textarea name="message" maxLength={10000} placeholder="Descreva o que aconteceu e o que você esperava." required/></label>
            <button disabled={busy}>{busy?'Enviando…':'Abrir chamado'}</button>
          </form>
        </section>

        <section className="account-section support-history">
          <div className="section-heading"><div><p className="eyebrow">CHAMADOS</p><h2>Histórico</h2></div><span>{tickets.length} total</span></div>
          <div className="ticket-list">
            {tickets.map(ticket=>{
              const project=projects.find(x=>x.id===ticket.projectId);
              return <article key={ticket.id} className="ticket-card">
                <header>
                  <div><strong>{ticket.subject}</strong><small>{new Date(ticket.createdAt).toLocaleString('pt-BR')}{project?' · '+project.title:''}</small></div>
                  <span className={'status-pill status-'+ticket.status.toLowerCase()}>{statusLabel[ticket.status]??ticket.status}</span>
                </header>
                <p>{ticket.message}</p>
                {ticket.reply&&<div className="ticket-reply"><small>RESPOSTA DA EQUIPE</small><p>{ticket.reply}</p></div>}
                {ticket.status==='RESOLVED'&&<button className="secondary" disabled={busy} onClick={()=>void reopen(ticket.id)}>Reabrir chamado</button>}
              </article>;
            })}
            {!tickets.length&&<div className="empty-state"><strong>Nenhum chamado ainda.</strong><p>Quando precisar, abra seu primeiro chamado ao lado.</p></div>}
          </div>
        </section>
      </div>
    </main>
  </>;
}
