import type {Metadata} from 'next';
import './style.css';
export const metadata:Metadata={title:'Cortes IA — seus melhores momentos',description:'Transforme vídeos em cortes, revise legendas e exporte para suas redes.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}
