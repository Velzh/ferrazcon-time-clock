import { RecognitionResponse } from '@/types/timeClock';

export type TotemState = 'IDLE' | 'WAKE' | 'RECOGNITION' | 'CONFIRMATION' | 'RESET';

export type FaceAlignStatus = 'NO_FACE' | 'MISALIGNED' | 'ALIGNED';

export interface ConfirmationData {
  success: boolean;
  response?: RecognitionResponse;
  message: string;
}

export interface TotemUiStatus {
  state: TotemState;
  statusLabel: string;
  statusMessage: string;
  progress: number;
  alignStatus: FaceAlignStatus;
  confirmation: ConfirmationData | null;
}
