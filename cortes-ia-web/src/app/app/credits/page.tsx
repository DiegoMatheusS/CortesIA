'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import NotificationBell from '@/components/NotificationBell';
import {api,friendly,key} from '@/lib/api';

type Wallet={wallet:{available:number;reserved:number};lots:{kind:string;available:number;reserved:number}[]};
type Package={name:string;credits:number;bonus:number;amountMinor:number;status:string};
type Purchase={id:string;package:string;credits:number;bonus:number;amountMinor:number;state:string;checkoutUrl?:string;createdAt:string};
type Ledger={id:string;operation:string;kind:string;availableDelta:number;reservedDelta:number;reason:string;itemCode?:string;createdAt:string};

const purchaseLabel:Record<string,string>={PENDING:'Pendente',APPROVED:'Aprovada',REFUNDED:'Reembolsada',CHARGEBACK:'Chargeback',REJECTED:'Recusada',CANCELLED:'Cancelada'};

export default function CreditsPage(){
  const [wallet,setWallet]=useState<Wallet>();
  const [packages,setPackages]=useState<Package[]>([]);
  const [purchases,setPurchases]=useState<Purchase[]>([]);
  const [ledger,setLedger]=useState<Ledger[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState('');

  async function load(){
    try{
      const [w,packs,buys,entries]=await Promise.all([
        api<Wallet>('/wallet'),api<Package[]>('/packages'),api<Purchase[]>('/purchases'),api<Ledger[]>('/wallet/transactions')
      ]);
      setWallet(w);setPackages(packs);setPurchases(buys);setLedger(entries);
    }catch(error){
      const code=(error as Error).message;
      if(code==='UNAUTHORIZED'||code==='HTTP 401')location.href='/login';
      else setMessage(friendly(code));
    }
  }
  useEffect(()=>{void load();},[]);

  const breakdown=useMemo(()=>{
    const lots=wallet?.lots??[];
    const sum=(k:string[])=>lots.filter(x=>k.includes(x.kind)).reduce((a,x)=>a+x.available,0);
    return {purchased:sum(['PURCHASED']),bonus:sum(['PURCHASE_BONUS']),benefits:sum(['TRIAL','PROMOTION','ADMIN_COMPENSATION'])};
  },[wallet]);

  async function buy(item:Package){
    if(busy)return;setBusy(item.name);setMessage('');
    try{
      const purchase=await api<{id:string;checkoutUrl?:string}>('/purchases','POST',{package:item.name},{key:key()});
      if(purchase.checkoutUrl){location.href=purchase.checkoutUrl;return;}
      setMessage('Compra local de teste criada. Nenhum pagamento real foi realizado.');
      await api('/dev/purchases/'+purchase.id+'/approve','POST',{});
      await load();
    }catch(error){setMessage(friendly((error as Error).message));}
    finally{setBusy(null);}
  }

  return <>
    <nav>
      <Link className="brand" href="/app">slice<span>flow</span></Link>
      <div><NotificationBell/><Link href="/app/account">Conta</Link><Link href="/app/support">Suporte</Link><Link href="/app">← Dashboard</Link></div>
    </nav>
    <main className="workspace credits-page">
      <section className="account-hero">
        <div><p className="eyebrow">CARTEIRA</p><h1>Créditos e compras</h1><p>Veja seu saldo, compre créditos e acompanhe todas as movimentações.</p></div>
        <div className="wallet-total"><small>SALDO DISPONÍVEL</small><strong>{wallet?.wallet.available??'—'}</strong><span>{wallet?.wallet.reserved??0} reservados</span></div>
      </section>

      {message&&<p className="notice dashboard-notice" role="status">{message}</p>}

      <div className="wallet-breakdown">
        <article><small>Comprados</small><strong>{wallet?breakdown.purchased:'—'}</strong></article>
        <article><small>Bônus</small><strong>{wallet?breakdown.bonus:'—'}</strong></article>
        <article><small>Benefícios</small><strong>{wallet?breakdown.benefits:'—'}</strong></article>
      </div>

      <section className="account-section">
        <div className="section-heading"><div><p className="eyebrow">PACOTES</p><h2>Adicionar créditos</h2></div><span>Pagamento via Mercado Pago quando ativado</span></div>
        <div className="packages packages-pro">
          {packages.map(item=><article key={item.name}>
            <div><small>{item.name}</small><strong>{item.credits+item.bonus}</strong><span>créditos</span></div>
            <p>{item.credits} comprados{item.bonus?' + '+item.bonus+' bônus':''}</p>
            <b>{(item.amountMinor/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</b>
            <button disabled={!!busy} onClick={()=>void buy(item)}>{busy===item.name?'Abrindo…':'Comprar'}</button>
          </article>)}
        </div>
      </section>

      <section className="account-section">
        <div className="section-heading"><div><p className="eyebrow">COMPRAS</p><h2>Histórico de pagamentos</h2></div><span>{purchases.length} registro(s)</span></div>
        <div className="data-table-wrap">
          <table className="account-table">
            <thead><tr><th>Data</th><th>Pacote</th><th>Créditos</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody>
              {purchases.map(x=><tr key={x.id}>
                <td>{new Date(x.createdAt).toLocaleString('pt-BR')}</td><td>{x.package}</td><td>{x.credits+x.bonus}</td>
                <td>{(x.amountMinor/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                <td><span className={'status-pill status-'+x.state.toLowerCase()}>{purchaseLabel[x.state]??x.state}</span></td>
              </tr>)}
              {!purchases.length&&<tr><td colSpan={5}>Nenhuma compra registrada ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="account-section">
        <div className="section-heading"><div><p className="eyebrow">EXTRATO</p><h2>Movimentações de créditos</h2></div></div>
        <div className="ledger-list">
          {ledger.map(x=><article key={x.id}>
            <div><strong>{x.reason||x.operation}</strong><small>{new Date(x.createdAt).toLocaleString('pt-BR')} · {x.kind}</small></div>
            <span className={x.availableDelta>=0?'credit-positive':'credit-negative'}>{x.availableDelta>0?'+':''}{x.availableDelta}</span>
          </article>)}
          {!ledger.length&&<p>Nenhuma movimentação registrada.</p>}
        </div>
      </section>
    </main>
  </>;
}
