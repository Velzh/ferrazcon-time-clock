import { getFaceApi, loadFaceModels } from '@/lib/faceApi';
import { recognitionService } from '@/services/recognitionService';
import { RecognitionResponse } from '@/types/timeClock';

const DEVICE_ID = 'totem-local';

export interface RecognitionStep {
  hasFace: boolean;
  aligned: boolean;
  response?: RecognitionResponse;
  errorMessage?: string;
}

function isFaceAligned(box: { x: number; y: number; width: number; height: number }, video: HTMLVideoElement) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const centerX = Math.abs(cx / w - 0.5);
  const centerY = Math.abs(cy / h - 0.5);
  const faceRatio = box.width / w;

  // Celular em pé / telas estreitas: relaxa um pouco para não bloquear o envio ao backend.
  const narrow = w < 720 || h > w;
  const tolX = narrow ? 0.26 : 0.18;
  const tolY = narrow ? 0.28 : 0.2;
  const minRatio = narrow ? 0.14 : 0.2;
  const maxRatio = narrow ? 0.78 : 0.65;

  const isCentered = centerX < tolX && centerY < tolY;
  const isSized = faceRatio > minRatio && faceRatio < maxRatio;
  return isCentered && isSized;
}

function normalize(descriptor: number[]): number[] {
  const mag = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0));
  if (!mag) return descriptor;
  return descriptor.map((val) => val / mag);
}

export async function runRecognitionStep(video: HTMLVideoElement): Promise<RecognitionStep> {
  await loadFaceModels();
  const faceapi = getFaceApi();

  const result = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();

  if (!result) {
    return { hasFace: false, aligned: false };
  }

  const aligned = isFaceAligned(result.detection.box, video);
  if (!aligned) {
    return { hasFace: true, aligned: false };
  }

  try {
    const response = await recognitionService.recognize({
      embedding: normalize(Array.from(result.descriptor)),
      deviceId: DEVICE_ID,
    });

    const debugTotem = import.meta.env.VITE_DEBUG_TOTEM === 'true';
    if (debugTotem && response && !response.matched) {
      console.warn('[totem] reconhecimento não casou', {
        vw: video.videoWidth,
        vh: video.videoHeight,
        similarity: response.similarity,
        message: response.message,
      });
    }

    return {
      hasFace: true,
      aligned: true,
      response,
    };
  } catch (error) {
    return {
      hasFace: true,
      aligned: true,
      errorMessage: error instanceof Error ? error.message : 'Erro no reconhecimento',
    };
  }
}
