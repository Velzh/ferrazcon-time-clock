import ferrazconLogo from "@/assets/ferrazcon-logo.png";

export function Header() {
  return (
    <header className="w-full bg-card shadow-sm border-b border-border">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-center md:justify-start gap-4">
          <img 
            src={ferrazconLogo} 
            alt="Ferrazcon Contabilidade" 
            className="h-12 md:h-16 object-contain"
          />
          <div className="hidden md:block">
            <h1 className="text-xl font-bold text-primary">FERRAZCON CONTABILIDADE</h1>
            <p className="text-sm text-muted-foreground">Sistema de Registro de Ponto</p>
          </div>
        </div>
      </div>
    </header>
  );
}
