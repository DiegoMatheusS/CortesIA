'use client';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api';

type Notice = {
  id: string;
  event: string;
  category: string;
  subject: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
};

type NoticeFeed = {unread: number; items: Notice[]};

export default function NotificationBell() {
  const [feed, setFeed] = useState<NoticeFeed>({unread: 0, items: []});
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      setFeed(await api<NoticeFeed>('/notifications'));
    } catch {
      // Session handling remains with the parent authenticated page.
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);

  async function read(item: Notice) {
    if (!item.readAt) {
      await api(`/notifications/${item.id}/read`, 'POST', {});
      await refresh();
    }
  }

  return (
    <div className="notification-bell">
      <button
        className="notification-bell-button secondary"
        type="button"
        aria-label={feed.unread ? `${feed.unread} notificações não lidas` : 'Notificações'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span aria-hidden="true">🔔</span>
        {feed.unread > 0 && <b>{Math.min(feed.unread, 99)}</b>}
      </button>

      {open && (
        <div className="notification-popover">
          <header>
            <strong>Notificações</strong>
            {feed.unread > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await api('/notifications/read-all', 'POST', {});
                  await refresh();
                }}
              >
                Marcar todas como lidas
              </button>
            )}
          </header>

          <div className="notification-items">
            {feed.items.slice(0, 12).map(item => (
              <button
                type="button"
                className={item.readAt ? 'notification-item' : 'notification-item unread'}
                key={item.id}
                onClick={() => void read(item)}
              >
                <span>{item.subject}</span>
                <p>{item.body}</p>
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR')}</time>
              </button>
            ))}
            {!feed.items.length && <p className="notification-empty">Nenhuma notificação ainda.</p>}
          </div>

          <footer><Link href="/app/settings/notifications" onClick={() => setOpen(false)}>Preferências de notificações</Link></footer>
        </div>
      )}
    </div>
  );
}
