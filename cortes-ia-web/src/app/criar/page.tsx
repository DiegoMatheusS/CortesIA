import type {Metadata} from 'next';
import Link from 'next/link';
import CreateStudio from '@/components/CreateStudio';

export const metadata: Metadata = {
  title: 'Criar cortes — SliceFlow',
  description: 'Envie um vídeo ou importe do YouTube e transforme conteúdo longo em cortes.',
};

export default function CreatePage() {
  return (
    <>
      <nav>
        <Link className="brand" href="/">slice<span>flow</span></Link>
        <div>
          <Link href="/#como">Como funciona</Link>
          <Link href="/#recursos">Recursos</Link>
          <Link href="/login">Entrar ↗</Link>
        </div>
      </nav>
      <main className="create-page">
        <CreateStudio />
      </main>
    </>
  );
}
