'use client';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import NotificationBell from '@/components/NotificationBell';
import {api, friendly} from '@/lib/api';

type Preferences = {
  processing: boolean;
  support: boolean;
  lowBalance: boolean;
  marketing: boolean;
  securityRequired: boolean;
  paymentsRequired: boolean;
  storageRequired: boolean;
};

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Preferences>('/notification-preferences')
      .then(setPrefs)
      .catch(error => {
        const code=(error as Error).message;
        if(code==='UNAUTHORIZED'||code==='HTTP 401') location.href='/login';
        else setMessage(friendly(code));
      });
  }, []);

  function toggle(key: 'processing'|'support'|'lowBalance'|'marketing') {
    setPrefs(current => current ? {...current, [key]: !current[key]} : current);
  }

  async function save() {
    if (!prefs || busy) return;
    setBusy(true);setMessage('');
    try {
      await api('/notification-preferences','PUT',{
        processingEmail:prefs.processing,
        supportEmail:prefs.support,
        lowBalanceEmail:prefs.lowBalance,
        marketingEmail:prefs.marketing,
      });
      setMessage('Preferências salvas.');
    } catch(error) {
      setMessage(friendly((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <nav>
        <Link className="brand" href="/app">slice<span>flow</span></Link>
        <div><NotificationBell/><Link href="/app">← Voltar</Link></div>
      </nav>
      <main className="workspace notification-settings">
        <section>
          <p className="eyebrow">CONTA</p>
          <h1>Preferências de notificações</h1>
          <p>Estados intermediários do processamento ficam no site. E-mail é reservado para eventos úteis ou obrigatórios.</p>

          <div className="notification-preference-list">
            <label><input type="checkbox" checked={prefs?.processing ?? true} onChange={() => toggle('processing')}/><span><b>Processamento</b><small>Vídeo recebido quando longo, pré-cortes prontos, falhas e renders finais.</small></span></label>
            <label><input type="checkbox" checked={prefs?.support ?? true} onChange={() => toggle('support')}/><span><b>Suporte</b><small>Nova resposta e chamado resolvido.</small></span></label>
            <label><input type="checkbox" checked={prefs?.lowBalance ?? false} onChange={() => toggle('lowBalance')}/><span><b>Saldo baixo</b><small>Aviso opcional quando o saldo disponível cair abaixo de 10 créditos.</small></span></label>
            <label><input type="checkbox" checked={prefs?.marketing ?? false} onChange={() => toggle('marketing')}/><span><b>Novidades e promoções</b><small>Desligado por padrão.</small></span></label>
            <label className="required"><input type="checkbox" checked readOnly/><span><b>Segurança</b><small>Obrigatório: confirmação, recuperação e alterações sensíveis.</small></span></label>
            <label className="required"><input type="checkbox" checked readOnly/><span><b>Pagamentos e créditos importantes</b><small>Obrigatório: aprovação, recusa, devolução, reembolso e chargeback.</small></span></label>
            <label className="required"><input type="checkbox" checked readOnly/><span><b>Armazenamento</b><small>Obrigatório: avisos 105/115/119 dias e exclusão dos arquivos.</small></span></label>
          </div>

          <button disabled={!prefs || busy} onClick={() => void save()}>{busy?'Salvando…':'Salvar preferências'}</button>
          {message && <p role="status" className="notice dashboard-notice">{message}</p>}
        </section>
      </main>
    </>
  );
}
