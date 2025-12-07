import { useCallback, useEffect, useRef, useState } from 'react';

import { recognitionService } from '@/services/recognitionService';
import { loadFaceModels, getEmbeddingFromVideo } from '@/lib/faceApi';
import { RecognitionResponse } from '@/types/timeClock';

const DEVICE_ID = 'totem-local';

export function useRecognitionLoop() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [statusMessage, setStatusMessage] = useState('Inicializando câmera...');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<RecognitionResponse | null>(null);
  const cooldownUntilRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraReady(true);
      setStatusMessage('Aproxime-se do totem para iniciar');
    } catch (error) {
      console.error('Erro ao iniciar câmera', error);
      setStatusMessage('Não foi possível acessar a câmera');
    }
  }, []);

  useEffect(() => {
    startCamera();
    loadFaceModels()
      .then(() => setIsModelReady(true))
      .catch((error) => {
        console.error('Erro ao carregar modelos de face', error);
        setStatusMessage('Erro ao carregar modelos de reconhecimento');
      });

    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !isCameraReady || !isModelReady || isProcessing) {
      return;
    }

    if (cooldownUntilRef.current > Date.now()) {
      return;
    }

    setIsProcessing(true);
    try {
      const embedding = await getEmbeddingFromVideo(videoRef.current);

      if (!embedding) {
        setStatusMessage('Rosto não detectado. Ajuste sua posição e iluminação.');
        return;
      }

      // Validação básica
      if (embedding.length === 0) {
        setStatusMessage('Erro ao processar rosto. Tente novamente.');
        return;
      }

      const result = await recognitionService.recognize({
        embedding,
        deviceId: DEVICE_ID,
      });

      setLastResult(result);

      if (result.matched) {
        if (result.timeEntry) {
          const similarityPercent = result.similarity 
            ? ` (${(result.similarity * 100).toFixed(1)}% de confiança)`
            : '';
          setStatusMessage(`${result.employee?.name ?? 'Colaborador'} reconhecido${similarityPercent}. Registro ${result.nextTypeLabel ?? ''}`);
          cooldownUntilRef.current = Date.now() + 8000;
        } else if (result.message) {
          setStatusMessage(result.message);
        }
      } else {
        // Mensagem mais clara quando não reconhece
        if (result.message) {
          setStatusMessage(result.message);
        } else {
          const similarityInfo = result.similarity !== undefined 
            ? ` (Similaridade: ${(result.similarity * 100).toFixed(1)}%)`
            : '';
          setStatusMessage(`Rosto não reconhecido. Procure o RH para cadastro.${similarityInfo}`);
        }
      }
    } catch (error) {
      console.error('Erro no reconhecimento facial', error);
      setStatusMessage(error instanceof Error ? error.message : 'Erro no reconhecimento');
    } finally {
      setIsProcessing(false);
    }
  }, [isCameraReady, isModelReady, isProcessing]);

  useEffect(() => {
    const interval = setInterval(() => {
      void processFrame();
    }, 3000);
    return () => clearInterval(interval);
  }, [processFrame]);

  return {
    videoRef,
    statusMessage,
    lastResult,
    isReady: isCameraReady && isModelReady,
    isProcessing,
  };
}
