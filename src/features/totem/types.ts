import { RecognitionResponse } from '@/types/timeClock';

export type TotemState = 'IDLE' | 'WAKE' | 'RECOGNITION' | 'CONFIRMATION' | 'RESET';

export type TotemBootStatus = 'loading' | 'ready' | 'error';

export type FaceAlignStatus =
  | 'NO_FACE'
  | 'TOO_FAR'
  | 'TOO_CLOSE'
  | 'OFF_CENTER'
  | 'HOLD_STILL'
  | 'ALIGNED'
  | 'MISALIGNED';

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
  bootStatus: TotemBootStatus;
  bootMessage: string;
}
