import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import ferrazconLogo from '@/assets/ferrazcon-logo.png';
import { TotemUiStatus } from './types';

function ClockBlock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

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
      className="w-full min-h-[100svh] bg-gradient-to-b from-[#020817] via-[#0b1120] to-black text-white grid grid-rows-[auto,1fr,auto] outline-none"
    >
      <header className="h-20 md:h-24 flex items-center justify-center px-4 pt-[max(env(safe-area-inset-top),8px)]">
        <img src={ferrazconLogo} alt="Ferrazcon" className="h-10 md:h-14 object-contain" />
      </header>

      <main className="flex items-center justify-center px-4">
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
    <div className="min-h-[100svh] bg-slate-950 text-white px-2.5 py-2.5 md:p-6">
      <header className="h-12 md:h-20 flex items-center justify-between md:justify-start gap-3 pt-[max(env(safe-area-inset-top),0px)] px-1 md:px-0">
        <img src={ferrazconLogo} alt="Ferrazcon" className="h-8 md:h-12 object-contain" />
        <div className="md:hidden text-[11px] font-semibold text-slate-300">
          {status.statusLabel}
        </div>
      </header>

      <main className="mx-auto max-w-6xl flex flex-col gap-3 md:gap-5 lg:grid lg:grid-cols-[1.55fr,1fr]">
        <section className="relative rounded-2xl md:rounded-3xl border border-white/10 bg-black/40 p-2 md:p-4 flex-1">
          <div className="relative rounded-xl md:rounded-2xl overflow-hidden border border-white/10 bg-black h-[72svh] sm:h-auto sm:aspect-[4/3] lg:aspect-[4/3]">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover [transform:scaleX(-1)]" />

            <div
              className={`absolute inset-4 sm:inset-8 md:inset-10 border-2 rounded-[20px] md:rounded-[28px] transition-colors ${
                isAligned ? 'border-emerald-400' : 'border-rose-400'
              }`}
            />

            <div className="absolute right-2 top-2 md:right-4 md:top-4 rounded-full px-2.5 md:px-3 py-1 text-[11px] md:text-xs font-semibold bg-black/60 border border-white/20">
              {isAligned ? 'Posição alinhada' : 'Ajuste sua posição'}
            </div>

            {/* Bottom sheet mobile */}
            <div className="lg:hidden absolute left-2 right-2 bottom-2 rounded-2xl border border-white/10 bg-black/55 backdrop-blur p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-sky-200">{status.statusLabel}</p>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isAligned ? 'bg-emerald-400' : status.alignStatus === 'NO_FACE' ? 'bg-slate-400' : 'bg-rose-400'
                  }`}
                />
              </div>
              <p className="text-[13px] text-slate-200 leading-snug">{status.statusMessage}</p>
              <ProgressBar value={status.progress} />
            </div>
          </div>
        </section>

        <aside className="hidden lg:block rounded-2xl md:rounded-3xl border border-white/10 bg-white/5 p-4 md:p-6 space-y-3.5 md:space-y-4">
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
