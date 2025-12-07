import { RecognitionResponse } from '@/types/timeClock';
import { apiClient } from './apiClient';

const DEVICE_TOKEN = import.meta.env.VITE_DEVICE_TOKEN ?? 'local-demo';

interface RecognitionPayload {
  embedding: number[];
  deviceId?: string;
  photoUrl?: string;
  previewOnly?: boolean;
}

export const recognitionService = {
  recognize: (payload: RecognitionPayload) =>
    apiClient.post<RecognitionResponse>('/api/recognitions', payload, {
      headers: {
        'X-Device-Token': DEVICE_TOKEN,
      },
    }),
};
