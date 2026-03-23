import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import ferrazconLogo from '@/assets/ferrazcon-logo.png';
import { TotemUiStatus } from './types';

function ClockBlock() {
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour12: false });
  const date = now.toLocaleDateString('pt-BR');

  return (
    <div className="text-center">
      <p className="font-mono text-[clamp(2.4rem,13vw,5.4rem)] md:text-[clamp(4rem,9vw,7rem)] font-bold tracking-wider text-white leading-none">
        {time}
      </p>
      <p className="mt-3 text-[clamp(0.95rem,3.8vw,1.2rem)] text-slate-300">{date}</p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div className="h-full bg-sky-400 transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function TotemIdleView({ onWake }: { onWake: () => void }) {
  return (
    <button
      type="button"
      onClick={onWake}
      className="w-full min-h-[100svh] bg-gradient-to-b from-[#020817] via-[#0b1120] to-black text-white flex flex-col outline-none"
    >
      <header className="h-20 md:h-24 flex items-center justify-center px-4 pt-[max(env(safe-area-inset-top),8px)]">
        <img src={ferrazconLogo} alt="Ferrazcon" className="h-10 md:h-14 object-contain" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <ClockBlock />
      </main>

      <footer className="pb-[max(env(safe-area-inset-bottom),18px)] text-center text-slate-400 text-sm md:text-base">
        Aproxime-se ou toque na tela
      </footer>
    </button>
  );
}

export function TotemWakeView() {
  return (
    <div className="min-h-[100svh] bg-gradient-to-br from-slate-950 to-slate-900 text-white flex items-center justify-center animate-in fade-in duration-500 px-5">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 mx-auto animate-spin text-sky-300" />
        <p className="text-lg md:text-xl font-semibold">Iniciando reconhecimento...</p>
      </div>
    </div>
  );
}

export function TotemRecognitionView({
  status,
  videoRef,
}: {
  status: TotemUiStatus;
  videoRef: React.RefObject<HTMLVideoElement>;
}) {
  const isAligned = status.alignStatus === 'ALIGNED';

  return (
    <div className="min-h-[100svh] bg-slate-950 text-white px-3 py-3 md:p-6">
      <header className="h-14 md:h-20 flex items-center justify-center md:justify-start pt-[max(env(safe-area-inset-top),0px)]">
        <img src={ferrazconLogo} alt="Ferrazcon" className="h-9 md:h-12 object-contain" />
      </header>

      <main className="mx-auto max-w-6xl grid gap-3 md:gap-5 lg:grid-cols-[1.55fr,1fr]">
        <section className="rounded-2xl md:rounded-3xl border border-white/10 bg-black/40 p-2.5 md:p-4">
          <div className="relative rounded-xl md:rounded-2xl overflow-hidden border border-white/10 bg-black aspect-[3/4] sm:aspect-[4/3]">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover [transform:scaleX(-1)]" />

            <div
              className={`absolute inset-5 sm:inset-8 md:inset-10 border-2 rounded-[22px] md:rounded-[28px] transition-colors ${
                isAligned ? 'border-emerald-400' : 'border-rose-400'
              }`}
            />

            <div className="absolute right-2.5 top-2.5 md:right-4 md:top-4 rounded-full px-2.5 md:px-3 py-1 text-[11px] md:text-xs font-semibold bg-black/60 border border-white/20">
              {isAligned ? 'Posição alinhada' : 'Ajuste sua posição'}
            </div>
          </div>
        </section>

        <aside className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/5 p-4 md:p-6 space-y-3.5 md:space-y-4">
          <h2 className="text-lg md:text-xl font-semibold">Status</h2>
          <p className="text-base md:text-lg text-sky-200">{status.statusLabel}</p>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed">{status.statusMessage}</p>

          <div className="pt-2">
            <ProgressBar value={status.progress} />
          </div>
        </aside>
      </main>
    </div>
  );
}

export function TotemConfirmationView({ status }: { status: TotemUiStatus }) {
  const ok = status.confirmation?.success;
  const response = status.confirmation?.response;
  const timestamp = response?.timeEntry?.timestamp
    ? new Date(response.timeEntry.timestamp).toLocaleTimeString('pt-BR')
    : new Date().toLocaleTimeString('pt-BR');

  return (
    <div className="min-h-[100svh] bg-slate-950 text-white flex items-center justify-center px-3 md:px-6">
      <div
        className={`w-full max-w-2xl rounded-2xl md:rounded-3xl border p-5 md:p-10 text-center space-y-3 md:space-y-4 ${
          ok ? 'bg-emerald-500/10 border-emerald-300/40' : 'bg-rose-500/10 border-rose-300/40'
        }`}
      >
        <div className="flex items-center justify-center">
          {ok ? <CheckCircle2 className="h-10 w-10 md:h-14 md:w-14 text-emerald-300" /> : <XCircle className="h-10 w-10 md:h-14 md:w-14 text-rose-300" />}
        </div>

        <h2 className="text-2xl md:text-3xl font-bold">{ok ? 'Batida confirmada' : 'Falha no registro'}</h2>

        <p className="text-lg md:text-xl">{response?.employee?.name ?? 'Colaborador não identificado'}</p>
        <p className="text-sm md:text-base text-slate-200">{response?.nextTypeLabel ?? status.confirmation?.message}</p>
        <p className="text-sm md:text-base text-slate-300">Horário: {timestamp}</p>
      </div>
    </div>
  );
}
