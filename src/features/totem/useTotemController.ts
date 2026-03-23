import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadFaceModels } from '@/lib/faceApi';
import { CameraSession, startCamera } from './cameraController';
import { runRecognitionStep } from './faceRecognition';
import { MotionDetector, startMotionDetector } from './motionDetector';
import { resolveTransition } from './stateManager';
import { ConfirmationData, FaceAlignStatus, TotemState, TotemUiStatus } from './types';

const recognitionConstraints: MediaStreamConstraints = {
  video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
  audio: false,
};

const motionConstraints: MediaStreamConstraints = {
  video: {
    width: { ideal: 320 },
    height: { ideal: 240 },
    facingMode: 'user',
    frameRate: { ideal: 7, max: 10 },
  },
  audio: false,
};

function randomResetMs() {
  return 5000 + Math.round(Math.random() * 3000);
}

export function useTotemController() {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const motionVideoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<TotemState>('IDLE');
  const [statusLabel, setStatusLabel] = useState('Em espera');
  const [statusMessage, setStatusMessage] = useState('Aproxime-se ou toque na tela');
  const [progress, setProgress] = useState(0);
  const [alignStatus, setAlignStatus] = useState<FaceAlignStatus>('NO_FACE');
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);

  const mainCameraRef = useRef<CameraSession | null>(null);
  const motionCameraRef = useRef<CameraSession | null>(null);
  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const recognitionIntervalRef = useRef<number | null>(null);
  const isRecognizingRef = useRef(false);
  const cooldownRef = useRef(0);

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
  }, [stopRecognitionLoop]);

  const stopMotion = useCallback(() => {
    motionDetectorRef.current?.stop();
    motionDetectorRef.current = null;
    motionCameraRef.current?.stop();
    motionCameraRef.current = null;
  }, []);

  const wake = useCallback(() => {
    transition('WAKE');
  }, [transition]);

  const startMotionMode = useCallback(async () => {
    if (!motionVideoRef.current || motionCameraRef.current) return;

    try {
      motionCameraRef.current = await startCamera(motionVideoRef.current, motionConstraints);
      motionDetectorRef.current = startMotionDetector(motionVideoRef.current, () => {
        wake();
      });
    } catch (_error) {
      setStatusMessage('Toque na tela para iniciar');
    }
  }, [wake]);

  const startRecognitionMode = useCallback(async () => {
    if (!mainVideoRef.current || mainCameraRef.current) return;

    setStatusLabel('Iniciando');
    setStatusMessage('Iniciando reconhecimento...');
    setProgress(20);

    try {
      await loadFaceModels();
      mainCameraRef.current = await startCamera(mainVideoRef.current, recognitionConstraints);
      setProgress(45);
      window.setTimeout(() => transition('RECOGNITION'), 550);
    } catch (_error) {
      setStatusLabel('Erro de câmera');
      setStatusMessage('Não foi possível iniciar a câmera');
      transition('RESET');
    }
  }, [transition]);

  useEffect(() => {
    if (state === 'IDLE') {
      stopMainCamera();
      setConfirmation(null);
      setAlignStatus('NO_FACE');
      setProgress(0);
      setStatusLabel('Em espera');
      setStatusMessage('Aproxime-se ou toque na tela');
      void startMotionMode();
      return;
    }

    if (state === 'WAKE') {
      stopMotion();
      void startRecognitionMode();
      return;
    }

    if (state === 'RECOGNITION') {
      setStatusLabel('Aguardando rosto');
      setStatusMessage('Centralize seu rosto no guia');

      recognitionIntervalRef.current = window.setInterval(async () => {
        if (!mainVideoRef.current || isRecognizingRef.current) return;
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
  }, [state, startMotionMode, startRecognitionMode, stopMainCamera, stopMotion, stopRecognitionLoop, transition]);

  useEffect(() => {
    return () => {
      stopMotion();
      stopMainCamera();
    };
  }, [stopMainCamera, stopMotion]);

  const uiStatus: TotemUiStatus = useMemo(
    () => ({
      state,
      statusLabel,
      statusMessage,
      progress,
      alignStatus,
      confirmation,
    }),
    [alignStatus, confirmation, progress, state, statusLabel, statusMessage]
  );

  return {
    mainVideoRef,
    motionVideoRef,
    uiStatus,
    wake,
  };
}
