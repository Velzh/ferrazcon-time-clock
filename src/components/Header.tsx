import { Link, useLocation } from 'react-router-dom';

import ferrazconLogo from '@/assets/ferrazcon-logo.png';
import { cn } from '@/lib/utils';

export function Header() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <header className="w-full bg-card shadow-sm border-b border-border">
      <div className="container mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <img src={ferrazconLogo} alt="Ferrazcon Contabilidade" className="h-12 md:h-16 object-contain" />
          <div>
            <h1 className="text-xl font-bold text-primary">FERRAZCON CONTABILIDADE</h1>
            <p className="text-sm text-muted-foreground">Gestão de ponto</p>
          </div>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link
            to="/totem"
            className={cn(
              'px-4 py-2 rounded-full border border-border font-semibold transition-colors',
              isActive('/totem') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            )}
          >
            Modo Totem
          </Link>
          <Link
            to="/admin"
            className={cn(
              'px-4 py-2 rounded-full border border-border font-semibold transition-colors',
              isActive('/admin') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            )}
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
