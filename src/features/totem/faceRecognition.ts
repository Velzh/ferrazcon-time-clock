import { recognitionService } from '@/services/recognitionService';
import { RecognitionResponse } from '@/types/timeClock';
import { FaceAlignStatus } from './types';

const DEVICE_ID = 'totem-local';
const STABLE_FRAMES_REQUIRED = 3;

export interface RecognitionStep {
  hasFace: boolean;
  aligned: boolean;
  alignStatus: FaceAlignStatus;
  message?: string;
  response?: RecognitionResponse;
  errorMessage?: string;
}

/** Captura frame JPEG do vídeo (espelhado como na UI). */
export function captureVideoFrameBase64(video: HTMLVideoElement, quality = 0.82): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Espelha para bater com o preview do usuário
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl;
}

let stableAlignedCount = 0;

export function resetAlignStability() {
  stableAlignedCount = 0;
}

/**
 * Fluxo Python: envia JPEG ao backend.
 * - detectOnly implícito até estabilizar no oval
 * - só registra ponto após N frames ALIGNED seguidos
 */
export async function runRecognitionStep(video: HTMLVideoElement): Promise<RecognitionStep> {
  const imageBase64 = captureVideoFrameBase64(video);
  if (!imageBase64) {
    return {
      hasFace: false,
      aligned: false,
      alignStatus: 'NO_FACE',
      message: 'Aguardando câmera...',
    };
  }

  try {
    // Primeiro só detecta alinhamento (barato no servidor)
    if (stableAlignedCount < STABLE_FRAMES_REQUIRED) {
      const detect = await recognitionService.recognize({
        imageBase64,
        deviceId: DEVICE_ID,
        detectOnly: true,
      });

      const alignStatus = (detect.alignStatus as FaceAlignStatus) || 'NO_FACE';
      if (alignStatus === 'ALIGNED') {
        stableAlignedCount += 1;
        if (stableAlignedCount < STABLE_FRAMES_REQUIRED) {
          return {
            hasFace: true,
            aligned: false,
            alignStatus: 'HOLD_STILL',
            message: 'Segure firme...',
          };
        }
      } else {
        stableAlignedCount = 0;
        return {
          hasFace: Boolean(detect.hasFace),
          aligned: false,
          alignStatus,
          message: detect.message,
        };
      }
    }

    // Frames estáveis: tenta reconhecimento completo
    const response = await recognitionService.recognize({
      imageBase64,
      deviceId: DEVICE_ID,
    });

    const alignStatus = (response.alignStatus as FaceAlignStatus) || 'ALIGNED';

    if (!response.matched) {
      if (alignStatus !== 'ALIGNED') {
        stableAlignedCount = 0;
        return {
          hasFace: Boolean(response.hasFace),
          aligned: false,
          alignStatus,
          message: response.message,
        };
      }
      // Alinhado mas não casou — reseta estabilidade para nova tentativa
      stableAlignedCount = 0;
      return {
        hasFace: true,
        aligned: true,
        alignStatus: 'ALIGNED',
        response,
        message: response.message,
      };
    }

    stableAlignedCount = 0;
    return {
      hasFace: true,
      aligned: true,
      alignStatus: 'ALIGNED',
      response,
    };
  } catch (error) {
    stableAlignedCount = 0;
    return {
      hasFace: false,
      aligned: false,
      alignStatus: 'NO_FACE',
      errorMessage: error instanceof Error ? error.message : 'Erro no reconhecimento',
    };
  }
}
