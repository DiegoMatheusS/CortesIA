'use client';

import {FormEvent, useEffect, useState} from 'react';
import Link from 'next/link';
import NotificationBell from '@/components/NotificationBell';
import {api, friendly} from '@/lib/api';

type Me = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpfMasked: string;
  roles: string[];
  twoFactorEnabled: boolean;
};

export default function AccountPage() {
  const [me,setMe]=useState<Me>();
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [mfaKey,setMfaKey]=useState('');
  const [mfaUri,setMfaUri]=useState('');

  async function load(){
    try{
      const user=await api<Me>('/me');
      setMe(user);setName(user.name);setPhone(user.phone||'');
    }catch(error){
      const code=(error as Error).message;
      if(code==='UNAUTHORIZED'||code==='HTTP 401') location.href='/login';
      else setMessage(friendly(code));
    }
  }

  useEffect(()=>{void load();},[]);

  async function saveProfile(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');
    try{
      await api('/me','PUT',{name,phone});
      setMessage('Dados da conta atualizados.');
      await load();
    }catch(error){setMessage(friendly((error as Error).message));}
    finally{setBusy(false);}
  }

  async function changePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const next=String(form.get('newPassword')||'');
    const confirm=String(form.get('confirmPassword')||'');
    if(next!==confirm){setMessage('As novas senhas não coincidem.');setBusy(false);return;}
    try{
      await api('/auth/change-password','POST',{
        currentPassword:form.get('currentPassword'),
        newPassword:next,
      });
      event.currentTarget.reset();
      setMessage('Senha alterada com sucesso.');
    }catch(error){setMessage(friendly((error as Error).message));}
    finally{setBusy(false);}
  }

  async function startMfa(){
    if(busy)return;setBusy(true);setMessage('');
    try{
      const result=await api<{key:string;uri:string}>('/auth/mfa/enroll','POST',{});
      setMfaKey(result.key);setMfaUri(result.uri);
      setMessage('Adicione a chave no seu aplicativo autenticador e confirme o código.');
    }catch(error){setMessage(friendly((error as Error).message));}
    finally{setBusy(false);}
  }

  async function confirmMfa(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');
    try{
      await api('/auth/mfa/confirm','POST',{code:new FormData(event.currentTarget).get('code')});
      setMessage('Autenticação em duas etapas ativada. Entre novamente para atualizar a sessão.');
      setMfaKey('');setMfaUri('');
      await load();
    }catch(error){setMessage(friendly((error as Error).message));}
    finally{setBusy(false);}
  }

  return (
    <>
      <nav>
        <Link className="brand" href="/app">slice<span>flow</span></Link>
        <div>
          <NotificationBell/>
          <Link href="/app/credits">Créditos</Link>
          <Link href="/app/support">Suporte</Link>
          <Link href="/app/settings/notifications">Notificações</Link>
          <Link href="/app">← Dashboard</Link>
        </div>
      </nav>

      <main className="workspace account-page">
        <section className="account-hero">
          <div>
            <p className="eyebrow">MINHA CONTA</p>
            <h1>Perfil e segurança</h1>
            <p>Gerencie seus dados de cadastro, senha e proteção da conta.</p>
          </div>
          <div className="account-status">
            <span>{me?.twoFactorEnabled?'MFA ativado':'MFA desativado'}</span>
            <small>{me?.email??'Carregando…'}</small>
          </div>
        </section>

        {message && <p role="status" className="notice dashboard-notice">{message}</p>}

        <div className="account-grid">
          <section className="account-card">
            <p className="eyebrow">DADOS</p><h2>Informações pessoais</h2>
            <form onSubmit={saveProfile}>
              <label>Nome<input value={name} minLength={2} maxLength={120} onChange={e=>setName(e.target.value)} required/></label>
              <label>Telefone<input value={phone} minLength={8} maxLength={20} onChange={e=>setPhone(e.target.value)} required/></label>
              <label>E-mail<input value={me?.email??''} readOnly/></label>
              <label>CPF<input value={me?.cpfMasked??''} readOnly/></label>
              <small>E-mail e CPF não são alterados diretamente nesta tela por segurança.</small>
              <button disabled={busy||!me}>{busy?'Salvando…':'Salvar dados'}</button>
            </form>
          </section>

          <section className="account-card">
            <p className="eyebrow">SENHA</p><h2>Alterar senha</h2>
            <form onSubmit={changePassword}>
              <label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required/></label>
              <label>Nova senha<input name="newPassword" type="password" autoComplete="new-password" required/></label>
              <label>Confirmar nova senha<input name="confirmPassword" type="password" autoComplete="new-password" required/></label>
              <button disabled={busy}>Alterar senha</button>
            </form>
          </section>

          <section className="account-card account-security">
            <p className="eyebrow">SEGURANÇA</p><h2>Autenticação em duas etapas</h2>
            {me?.twoFactorEnabled ? (
              <div className="security-ok"><strong>Proteção adicional ativa</strong><p>Seu login exige o código do autenticador quando necessário.</p></div>
            ) : (
              <>
                <p>Use um aplicativo autenticador para adicionar uma segunda camada de proteção.</p>
                {!mfaKey && <button disabled={busy||!me} onClick={()=>void startMfa()}>Ativar MFA</button>}
                {mfaKey && (
                  <div className="mfa-enroll">
                    <small>CHAVE DO AUTENTICADOR</small>
                    <code>{mfaKey}</code>
                    <details><summary>URI completa</summary><code>{mfaUri}</code></details>
                    <form onSubmit={confirmMfa}>
                      <label>Código de 6 dígitos<input name="code" inputMode="numeric" autoComplete="one-time-code" required/></label>
                      <button disabled={busy}>Confirmar e ativar</button>
                    </form>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="account-card account-links">
            <p className="eyebrow">PREFERÊNCIAS</p><h2>Outras configurações</h2>
            <Link className="account-link-row" href="/app/settings/notifications"><span>Notificações</span><b>→</b></Link>
            <Link className="account-link-row" href="/app/credits"><span>Créditos e compras</span><b>→</b></Link>
            <Link className="account-link-row" href="/app/support"><span>Suporte e chamados</span><b>→</b></Link>
          </section>
        </div>
      </main>
    </>
  );
}
