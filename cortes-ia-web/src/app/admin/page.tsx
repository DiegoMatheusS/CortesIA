'use client';

import {FormEvent, useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {api, friendly, key} from '@/lib/api';

type Me = {
  name: string;
  email: string;
  admin: boolean;
  staff: boolean;
  roles: string[];
  twoFactorEnabled: boolean;
};

type QueryName = 'users'|'jobs'|'purchases'|'audit'|'tickets'|'settings';

export default function Admin() {
  const [me, setMe] = useState<Me>();
  const [data, setData] = useState<unknown>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const permissions = useMemo(() => {
    const roles = me?.roles ?? [];
    const admin = roles.includes('Admin');
    return {
      admin,
      support: admin || roles.includes('Support'),
      finance: admin || roles.includes('Finance'),
      security: admin || roles.includes('Security'),
      staff: !!me?.staff,
    };
  }, [me]);

  const queries = useMemo(() => {
    const list: {name: QueryName; label: string}[] = [{name:'users', label:'Usuários'}];
    if (permissions.support) list.push({name:'jobs',label:'Jobs'},{name:'tickets',label:'Chamados'});
    if (permissions.finance) list.push({name:'purchases',label:'Compras'});
    if (permissions.security) list.push({name:'audit',label:'Auditoria'});
    if (permissions.admin) list.push({name:'settings',label:'Configurações'});
    return list;
  }, [permissions]);

  useEffect(() => {
    void api<Me>('/me')
      .then(user => {
        if (!user.staff) {
          window.location.href='/app';
          return;
        }
        setMe(user);
      })
      .catch(error => {
        const code=(error as Error).message;
        if(code==='UNAUTHORIZED'||code==='HTTP 401') window.location.href='/login';
        else setMessage(friendly(code));
      });
  }, []);

  async function load(name: QueryName) {
    setBusy(true);setMessage('');
    try {
      setData(await api('/admin/'+name));
    } catch(error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function submitCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    try {
      await api('/admin/credits/adjust','POST',{
        userId:form.get('userId'),
        credits:Number(form.get('credits')),
        reason:form.get('reason'),
      },{key:key()});
      setMessage('Ajuste financeiro registrado e auditado.');
      event.currentTarget.reset();
    } catch(error) {
      setMessage(friendly((error as Error).message));
    } finally {setBusy(false);}
  }

  async function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const userId=String(form.get('userId')||'');
    try {
      await api(`/admin/users/${userId}/block`,'POST',{
        blocked:form.get('blocked')==='true',
        reason:form.get('reason'),
      });
      setMessage('Estado de segurança do usuário atualizado.');
      event.currentTarget.reset();
    } catch(error) {
      setMessage(friendly((error as Error).message));
    } finally {setBusy(false);}
  }

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const ticketId=String(form.get('ticketId')||'');
    try {
      await api(`/admin/tickets/${ticketId}/reply`,'POST',{
        reply:form.get('reply'),
        status:form.get('status'),
      });
      setMessage('Resposta de suporte registrada.');
      event.currentTarget.reset();
    } catch(error) {
      setMessage(friendly((error as Error).message));
    } finally {setBusy(false);}
  }

  return (
    <>
      <nav>
        <Link href="/app">← Plataforma</Link>
        <b>Operação SliceFlow · MFA obrigatório</b>
      </nav>

      <main className="workspace">
        <section>
          <p className="eyebrow">EQUIPE</p>
          <h1>Operação SliceFlow</h1>
          <p>{me?.email ?? 'Carregando…'}</p>
          <div className="row">
            {(me?.roles ?? []).map(role => <span className="source-badge" key={role}>{role}</span>)}
          </div>
        </section>

        <section>
          <h2>Consultas permitidas</h2>
          <div className="row">
            {queries.map(item => (
              <button key={item.name} disabled={busy} onClick={() => void load(item.name)}>
                {item.label}
              </button>
            ))}
          </div>
          <pre className="data">{data ? JSON.stringify(data,null,2) : 'Escolha uma consulta.'}</pre>
        </section>

        {permissions.finance && (
          <section>
            <p className="eyebrow">FINANCE</p>
            <h2>Ajuste auditado de créditos</h2>
            <form onSubmit={submitCredit}>
              <label>ID do usuário<input name="userId" required /></label>
              <label>Créditos (+ ou −)<input name="credits" type="number" required /></label>
              <label>Justificativa<textarea name="reason" required minLength={5} /></label>
              <button disabled={busy}>Registrar ajuste</button>
            </form>
          </section>
        )}

        {permissions.security && (
          <section>
            <p className="eyebrow">SECURITY</p>
            <h2>Bloquear ou liberar usuário</h2>
            <form onSubmit={submitBlock}>
              <label>ID do usuário<input name="userId" required /></label>
              <label>
                Estado
                <select name="blocked" defaultValue="true">
                  <option value="true">Bloquear</option>
                  <option value="false">Liberar</option>
                </select>
              </label>
              <label>Justificativa<textarea name="reason" required minLength={5} /></label>
              <button disabled={busy}>Aplicar ação de segurança</button>
            </form>
          </section>
        )}

        {permissions.support && (
          <section>
            <p className="eyebrow">SUPPORT</p>
            <h2>Responder chamado</h2>
            <form onSubmit={submitTicket}>
              <label>ID do chamado<input name="ticketId" required /></label>
              <label>
                Status
                <select name="status" defaultValue="ANSWERED">
                  <option value="IN_REVIEW">Em análise</option>
                  <option value="ANSWERED">Respondido</option>
                  <option value="RESOLVED">Resolvido</option>
                </select>
              </label>
              <label>Resposta<textarea name="reply" required /></label>
              <button disabled={busy}>Registrar resposta</button>
            </form>
          </section>
        )}

        {message && <p className="notice" role="status">{message}</p>}
      </main>
    </>
  );
}
