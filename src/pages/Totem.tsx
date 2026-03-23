import {
  TotemConfirmationView,
  TotemIdleView,
  TotemRecognitionView,
  TotemWakeView,
} from '@/features/totem/uiRenderer';
import { useTotemController } from '@/features/totem/useTotemController';

export function TotemPage() {
  const { mainVideoRef, motionVideoRef, uiStatus, wake } = useTotemController();

  return (
    <>
      <video ref={motionVideoRef} autoPlay playsInline muted className="hidden" />

      {uiStatus.state === 'IDLE' && <TotemIdleView onWake={wake} />}
      {uiStatus.state === 'WAKE' && <TotemWakeView />}
      {uiStatus.state === 'RECOGNITION' && <TotemRecognitionView status={uiStatus} videoRef={mainVideoRef} />}
      {(uiStatus.state === 'CONFIRMATION' || uiStatus.state === 'RESET') && (
        <TotemConfirmationView status={uiStatus} />
      )}
    </>
  );
}
