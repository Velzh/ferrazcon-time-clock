import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import ferrazconLogo from '@/assets/ferrazcon-logo.png';
import { TotemUiStatus } from './types';

function ClockBlock() {
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour12: false });
  const date = now.toLocaleDateString('pt-BR');

  return (
    <div className="text-center">
      <p className="font-mono text-6xl md:text-8xl font-bold tracking-wider text-white">{time}</p>
      <p className="mt-3 text-lg md:text-xl text-slate-300">{date}</p>
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
      className="w-full min-h-screen bg-gradient-to-b from-[#020817] via-[#0b1120] to-black text-white flex flex-col outline-none"
    >
      <header className="h-24 flex items-center justify-center">
        <img src={ferrazconLogo} alt="Ferrazcon" className="h-14 object-contain" />
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <ClockBlock />
      </main>

      <footer className="pb-10 text-center text-slate-400 text-sm md:text-base">Aproxime-se ou toque na tela</footer>
    </button>
  );
}

export function TotemWakeView() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-white flex items-center justify-center animate-in fade-in duration-500">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 mx-auto animate-spin text-sky-300" />
        <p className="text-xl font-semibold">Iniciando reconhecimento...</p>
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
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6">
      <header className="h-20 flex items-center justify-center md:justify-start">
        <img src={ferrazconLogo} alt="Ferrazcon" className="h-12 object-contain" />
      </header>

      <main className="mx-auto max-w-7xl grid gap-5 lg:grid-cols-[1.6fr,1fr]">
        <section className="rounded-3xl border border-white/10 bg-black/40 p-4">
          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black aspect-[4/3]">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover [transform:scaleX(-1)]" />

            <div
              className={`absolute inset-8 md:inset-10 border-2 rounded-[28px] transition-colors ${
                isAligned ? 'border-emerald-400' : 'border-rose-400'
              }`}
            />

            <div className="absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-semibold bg-black/60 border border-white/20">
              {isAligned ? 'Posição alinhada' : 'Ajuste sua posição'}
            </div>
          </div>
        </section>

        <aside className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Status</h2>
          <p className="text-lg text-sky-200">{status.statusLabel}</p>
          <p className="text-slate-300">{status.statusMessage}</p>

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
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div
        className={`w-full max-w-2xl rounded-3xl border p-10 text-center space-y-4 ${
          ok ? 'bg-emerald-500/10 border-emerald-300/40' : 'bg-rose-500/10 border-rose-300/40'
        }`}
      >
        <div className="flex items-center justify-center">
          {ok ? <CheckCircle2 className="h-14 w-14 text-emerald-300" /> : <XCircle className="h-14 w-14 text-rose-300" />}
        </div>

        <h2 className="text-3xl font-bold">{ok ? 'Batida confirmada' : 'Falha no registro'}</h2>

        <p className="text-xl">{response?.employee?.name ?? 'Colaborador não identificado'}</p>
        <p className="text-slate-200">{response?.nextTypeLabel ?? status.confirmation?.message}</p>
        <p className="text-slate-300">Horário: {timestamp}</p>
      </div>
    </div>
  );
}
