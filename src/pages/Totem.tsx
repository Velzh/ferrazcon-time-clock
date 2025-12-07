
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Clock3, Shield, Users } from 'lucide-react';

import { Header } from '@/components/Header';
import { DigitalClock } from '@/components/DigitalClock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { timeEntryService } from '@/services/timeEntryService';
import { useRecognitionLoop } from '@/hooks/useRecognitionLoop';
import { RECORD_TYPE_LABELS, RecognitionResponse } from '@/types/timeClock';

const REFRESH_INTERVAL = 7000;

interface StatusBadge {
  label: string;
  message: string;
  color: string;
}

export function TotemPage() {
  const { videoRef, statusMessage, lastResult, isReady } = useRecognitionLoop();
  const { data: todayEntries = [] } = useQuery({
    queryKey: ['time-entries-today'],
    queryFn: () => timeEntryService.listToday(),
    refetchInterval: REFRESH_INTERVAL,
  });

  const latestEntries = useMemo(() => todayEntries.slice(0, 5), [todayEntries]);
  const totalToday = todayEntries.length;
  const [lastSuccess, setLastSuccess] = useState<RecognitionResponse | null>(null);

  const status: StatusBadge = useMemo(() => {
    if (!isReady) {
      return {
        label: 'Preparando reconhecimento...',
        message: 'Carregando câmera e modelos biométricos.',
        color: 'bg-amber-400',
      };
    }

    if (lastResult?.matched && lastResult.timeEntry) {
      return {
        label: 'Registro confirmado',
        message: `Batida ${lastResult.nextTypeLabel ?? ''} registrada às ${new Date(
          lastResult.timeEntry.timestamp
        ).toLocaleTimeString('pt-BR')}`,
        color: 'bg-emerald-400',
      };
    }

    if (lastResult && !lastResult.matched) {
      return {
        label: 'Rosto não reconhecido',
        message: lastResult.message ?? 'Ajuste sua posição ou procure o RH.',
        color: 'bg-rose-500',
      };
    }

    return {
      label: 'Aguardando colaborador',
      message: statusMessage || 'Aproxime-se do totem e mantenha-se visível.',
      color: 'bg-sky-500',
    };
  }, [isReady, lastResult, statusMessage]);

  const readableStatusMessage = useMemo(() => {
    if (!status.message) return '';
    if (status.message.startsWith('[')) {
      return 'Erro ao processar a resposta. Tente novamente em instantes.';
    }
    return status.message;
  }, [status.message]);

  useEffect(() => {
    if (lastResult?.matched && lastResult.timeEntry) {
      setLastSuccess(lastResult);
      const timeout = setTimeout(() => setLastSuccess(null), 6000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [lastResult]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pb-10">
        <div className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
          <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl">
            <div className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.35),_transparent_45%)]" />
            <div className="relative flex flex-col gap-6">
              <div className="relative aspect-[4/3] rounded-[28px] border border-white/10 bg-black overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover [transform:scaleX(-1)]"
                />
                <div className="absolute top-5 right-5 flex items-center gap-2 text-sm font-semibold backdrop-blur px-4 py-2 rounded-full border border-white/10">
                  <span className={`h-3 w-3 rounded-full ${status.color} animate-pulse`} />
                  {status.label}
                </div>
                {lastSuccess && (
                  <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-center space-y-3 px-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-200 flex items-center justify-center">
                      <CheckCircle2 className="w-10 h-10 text-emerald-300" />
                    </div>
                    <p className="text-lg font-semibold">{lastSuccess.employee?.name}</p>
                    <p className="text-sm text-slate-200">
                      Registro {lastSuccess.nextTypeLabel ?? 'confirmado'} às{' '}
                      {new Date(lastSuccess.timeEntry!.timestamp).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-white/60 mb-1">Passo 1</p>
                  <p className="text-sm font-medium">Aproxime o rosto alinhado ao quadro.</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-white/60 mb-1">Passo 2</p>
                  <p className="text-sm font-medium">Permaneça imóvel até o indicador ficar verde.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Shield className="w-5 h-5 text-emerald-300" />
                <p className="text-sm text-slate-200 leading-relaxed">
                  Seus dados biométricos são tratados de acordo com a LGPD. As imagens permanecem neste dispositivo e não são compartilhadas com terceiros.
                </p>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <Card className="rounded-[32px] border-none bg-white text-slate-900 shadow-2xl">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center justify-between">
                  <span>Próximo registro</span>
                  <Clock3 className="w-5 h-5 text-slate-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="py-6 space-y-5">
                <DigitalClock />
                <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-500">Status do totem</p>
                  <p className="text-base font-medium mt-1">{readableStatusMessage}</p>
                </div>
                {lastResult?.matched && lastResult.timeEntry && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-lg font-semibold text-emerald-900">
                      <CheckCircle2 className="w-5 h-5" />
                      {lastResult.employee?.name}
                    </div>
                    <p className="text-sm text-emerald-800">
                      {lastResult.nextTypeLabel ?? 'Registro confirmado'} · Similaridade {(lastResult.similarity ?? 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[32px] border border-white/10 bg-slate-900/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-300" />
                  Batidas de hoje
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Horário</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-semibold">{entry.employee?.name ?? entry.employeeId}</TableCell>
                        <TableCell>{RECORD_TYPE_LABELS[entry.type]}</TableCell>
                        <TableCell>{new Date(entry.timestamp).toLocaleTimeString('pt-BR')}</TableCell>
                      </TableRow>
                    ))}
                    {!latestEntries.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-slate-400">
                          Nenhum registro ainda.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-2xl border border-white/10 bg-white/5 text-white">
                <CardContent className="flex items-center gap-3 py-4">
                  <Users className="w-5 h-5 text-sky-300" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/60">Batidas registradas</p>
                    <p className="text-2xl font-semibold">{totalToday}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border border-white/10 bg-white/5 text-white">
                <CardContent className="flex items-center gap-3 py-4">
                  <Shield className="w-5 h-5 text-emerald-300" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/60">Próximo passo</p>
                    <p className="text-sm font-semibold">{lastResult?.nextTypeLabel ?? 'Aguardando'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
