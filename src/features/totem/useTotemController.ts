import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraSession, startCamera } from './cameraController';
import { resetAlignStability, runRecognitionStep } from './faceRecognition';
import { resolveTransition } from './stateManager';
import { isLikelyIOS, sleep } from './device';
import { ConfirmationData, FaceAlignStatus, TotemBootStatus, TotemState, TotemUiStatus } from './types';

/** Constraints estáveis para mobile. */
const recognitionConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'user' },
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24, max: 30 },
  },
};

function randomResetMs() {
  return 5000 + Math.round(Math.random() * 3000);
}

function alignLabel(status: FaceAlignStatus): { label: string; message: string; progress: number } {
  switch (status) {
    case 'TOO_FAR':
      return { label: 'Aproxime-se', message: 'Aproxime o rosto do oval', progress: 25 };
    case 'TOO_CLOSE':
      return { label: 'Afaste-se', message: 'Afaste um pouco o rosto', progress: 25 };
    case 'OFF_CENTER':
      return { label: 'Centralize', message: 'Centralize o rosto no oval', progress: 30 };
    case 'HOLD_STILL':
      return { label: 'Segure firme', message: 'Mantenha o rosto no oval...', progress: 55 };
    case 'ALIGNED':
      return { label: 'Identificando...', message: 'Processando biometria', progress: 75 };
    case 'MISALIGNED':
      return { label: 'Ajuste de posição', message: 'Alinhe o rosto ao oval', progress: 30 };
    case 'NO_FACE':
    default:
      return { label: 'Aguardando rosto', message: 'Encaixe o rosto no oval', progress: 15 };
  }
}

export function useTotemController() {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const [bootStatus, setBootStatus] = useState<TotemBootStatus>('loading');
  const [bootMessage, setBootMessage] = useState('Carregando totem...');
  const [state, setState] = useState<TotemState>('IDLE');
  const [statusLabel, setStatusLabel] = useState('Em espera');
  const [statusMessage, setStatusMessage] = useState('Toque na tela para bater o ponto');
  const [progress, setProgress] = useState(0);
  const [alignStatus, setAlignStatus] = useState<FaceAlignStatus>('NO_FACE');
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);

  const mainCameraRef = useRef<CameraSession | null>(null);
  const recognitionIntervalRef = useRef<number | null>(null);
  const isRecognizingRef = useRef(false);
  const cooldownRef = useRef(0);
  const lastActivityRef = useRef<number>(Date.now());
  const startingCameraRef = useRef(false);

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const transition = useCallback((next: TotemState) => {
    setState((prev) => resolveTransition(prev, next));
  }, []);

  const stopRecognitionLoop = useCallback(() => {
    if (recognitionIntervalRef.current) {
      window.clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }
    isRecognizingRef.current = false;
  }, []);

  const stopMainCamera = useCallback(() => {
    stopRecognitionLoop();
    mainCameraRef.current?.stop();
    mainCameraRef.current = null;
    startingCameraRef.current = false;
    resetAlignStability();
  }, [stopRecognitionLoop]);

  const wake = useCallback(() => {
    if (bootStatus !== 'ready') return;
    touchActivity();
    transition('WAKE');
  }, [bootStatus, touchActivity, transition]);

  const startRecognitionMode = useCallback(async () => {
    if (!mainVideoRef.current || mainCameraRef.current || startingCameraRef.current) return;

    startingCameraRef.current = true;
    setStatusLabel('Iniciando');
    setStatusMessage('Liberando câmera...');
    setProgress(20);
    resetAlignStability();

    try {
      if (isLikelyIOS()) {
        await sleep(280);
      }
      if (!mainVideoRef.current) {
        throw new Error('Elemento de vídeo indisponível');
      }
      mainCameraRef.current = await startCamera(mainVideoRef.current, recognitionConstraints);
      setProgress(40);
      setStatusLabel('Aguardando rosto');
      setStatusMessage('Encaixe o rosto no oval');
      touchActivity();
    } catch (_error) {
      setStatusLabel('Erro de câmera');
      setStatusMessage('Permita o acesso à câmera e toque novamente');
      startingCameraRef.current = false;
      transition('RESET');
      return;
    } finally {
      startingCameraRef.current = false;
    }
  }, [touchActivity, transition]);

  // Bootstrap leve: Python não precisa baixar modelos no celular
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      setBootStatus('ready');
      setBootMessage('Totem pronto');
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const onAnyInteraction = () => touchActivity();
    window.addEventListener('pointerdown', onAnyInteraction, { passive: true });
    window.addEventListener('keydown', onAnyInteraction);
    return () => {
      window.removeEventListener('pointerdown', onAnyInteraction);
      window.removeEventListener('keydown', onAnyInteraction);
    };
  }, [touchActivity]);

  useEffect(() => {
    if (state === 'IDLE') return;
    const interval = window.setInterval(() => {
      const inactiveForMs = Date.now() - lastActivityRef.current;
      if ((state === 'WAKE' || state === 'RECOGNITION') && inactiveForMs > 20_000) {
        transition('RESET');
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state, transition]);

  useEffect(() => {
    if (state === 'IDLE') {
      stopMainCamera();
      setConfirmation(null);
      setAlignStatus('NO_FACE');
      setProgress(0);
      setStatusLabel('Em espera');
      setStatusMessage('Toque na tela para bater o ponto');
      touchActivity();
      return;
    }

    if (state === 'WAKE') {
      setStatusLabel('Iniciando');
      setStatusMessage('Iniciando reconhecimento...');
      setProgress(10);
      touchActivity();

      let cancelled = false;
      void (async () => {
        if (!mainCameraRef.current) {
          await startRecognitionMode();
        }
        if (cancelled) return;
        await sleep(isLikelyIOS() ? 350 : 180);
        if (!cancelled) transition('RECOGNITION');
      })();

      return () => {
        cancelled = true;
      };
    }

    if (state === 'RECOGNITION') {
      if (!mainCameraRef.current && !startingCameraRef.current) {
        touchActivity();
        void startRecognitionMode();
      }

      recognitionIntervalRef.current = window.setInterval(async () => {
        if (!mainVideoRef.current || isRecognizingRef.current) return;
        if (!mainCameraRef.current) return;
        if (Date.now() < cooldownRef.current) return;

        isRecognizingRef.current = true;
        try {
          const step = await runRecognitionStep(mainVideoRef.current);
          setAlignStatus(step.alignStatus);

          if (step.errorMessage) {
            setStatusLabel('Falha');
            setStatusMessage(step.errorMessage);
            setProgress(0);
            cooldownRef.current = Date.now() + 2000;
            return;
          }

          if (!step.aligned) {
            const meta = alignLabel(step.alignStatus);
            setStatusLabel(meta.label);
            setStatusMessage(step.message ?? meta.message);
            setProgress(meta.progress);
            return;
          }

          touchActivity();

          if (step.response?.matched) {
            setProgress(100);
            setConfirmation({
              success: true,
              response: step.response,
              message: step.response.message ?? 'Registro confirmado',
            });
            transition('CONFIRMATION');
            return;
          }

          setStatusLabel('Não reconhecido');
          setStatusMessage(step.response?.message ?? step.message ?? 'Rosto não reconhecido');
          setProgress(0);
          cooldownRef.current = Date.now() + 2500;
        } finally {
          isRecognizingRef.current = false;
        }
      }, 900);

      return () => stopRecognitionLoop();
    }

    if (state === 'CONFIRMATION') {
      const timeout = window.setTimeout(() => transition('RESET'), 2000);
      return () => window.clearTimeout(timeout);
    }

    if (state === 'RESET') {
      stopMainCamera();
      setStatusLabel('Retornando ao modo espera');
      setStatusMessage('Totem pronto para o próximo colaborador');
      setAlignStatus('NO_FACE');
      const timeout = window.setTimeout(() => transition('IDLE'), randomResetMs());
      return () => window.clearTimeout(timeout);
    }
  }, [state, startRecognitionMode, stopMainCamera, stopRecognitionLoop, touchActivity, transition]);

  useEffect(() => {
    return () => {
      stopMainCamera();
    };
  }, [stopMainCamera]);

  const uiStatus: TotemUiStatus = useMemo(
    () => ({
      state,
      statusLabel,
      statusMessage,
      progress,
      alignStatus,
      confirmation,
      bootStatus,
      bootMessage,
    }),
    [alignStatus, bootMessage, bootStatus, confirmation, progress, state, statusLabel, statusMessage]
  );

  return {
    mainVideoRef,
    uiStatus,
    wake,
  };
}
