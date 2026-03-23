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
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const centerX = Math.abs(cx / video.videoWidth - 0.5);
  const centerY = Math.abs(cy / video.videoHeight - 0.5);
  const faceRatio = box.width / video.videoWidth;

  const isCentered = centerX < 0.18 && centerY < 0.2;
  const isSized = faceRatio > 0.2 && faceRatio < 0.65;
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
