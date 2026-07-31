import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadFaceModels } from '@/lib/faceApi';
import { CameraSession, startCamera } from './cameraController';
import { runRecognitionStep } from './faceRecognition';
import { resolveTransition } from './stateManager';
import { isLikelyIOS, sleep } from './device';
import { ConfirmationData, FaceAlignStatus, TotemBootStatus, TotemState, TotemUiStatus } from './types';

/** Constraints estáveis: evita “zoom” por troca de resolução alta/baixa. */
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

    try {
      // Safari iOS: pequeno atraso ajuda após troca de tela.
      if (isLikelyIOS()) {
        await sleep(280);
      }

      // Modelos já devem estar no bootstrap; reforça sem custo se já carregados.
      await loadFaceModels();

      if (!mainVideoRef.current) {
        throw new Error('Elemento de vídeo indisponível');
      }

      mainCameraRef.current = await startCamera(mainVideoRef.current, recognitionConstraints);
      setProgress(45);
      setStatusLabel('Aguardando rosto');
      setStatusMessage('Centralize seu rosto no guia');
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

  // Bootstrap: carrega modelos assim que o totem abre (1ª visita).
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setBootStatus('loading');
        setBootMessage('Carregando reconhecimento facial...');
        await loadFaceModels();
        if (cancelled) return;
        setBootStatus('ready');
        setBootMessage('Totem pronto');
      } catch (_error) {
        if (cancelled) return;
        setBootStatus('error');
        setBootMessage('Falha ao carregar o totem. Recarregue a página.');
      }
    })();

    return () => {
      cancelled = true;
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
      if ((state === 'WAKE' || state === 'RECOGNITION') && inactiveForMs > 12_000) {
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
        // Liga a câmera ainda no WAKE (vídeo já montado, só oculto) para estabilizar antes de mostrar.
        if (!mainCameraRef.current) {
          await startRecognitionMode();
        }
        if (cancelled) return;
        const settle = isLikelyIOS() ? 350 : 180;
        await sleep(settle);
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

          if (!step.hasFace) {
            setAlignStatus('NO_FACE');
            setStatusLabel('Aguardando rosto');
            setStatusMessage('Aproxime-se da câmera');
            setProgress(15);
            return;
          }

          touchActivity();

          if (!step.aligned) {
            setAlignStatus('MISALIGNED');
            setStatusLabel('Ajuste de posição');
            setStatusMessage('Alinhe o rosto ao quadro');
            setProgress(35);
            return;
          }

          setAlignStatus('ALIGNED');
          setStatusLabel('Identificando...');
          setStatusMessage('Processando biometria');
          setProgress(70);

          if (step.errorMessage) {
            setStatusLabel('Falha de reconhecimento');
            setStatusMessage(step.errorMessage);
            setProgress(0);
            cooldownRef.current = Date.now() + 2500;
            return;
          }

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
          setStatusMessage(step.response?.message ?? 'Rosto não reconhecido');
          setProgress(0);
          cooldownRef.current = Date.now() + 2500;
        } finally {
          isRecognizingRef.current = false;
        }
      }, 1100);

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
