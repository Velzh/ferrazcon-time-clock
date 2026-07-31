import {
  TotemBootView,
  TotemConfirmationView,
  TotemIdleView,
  TotemRecognitionView,
  TotemWakeView,
} from '@/features/totem/uiRenderer';
import { useTotemController } from '@/features/totem/useTotemController';

export function TotemPage() {
  const { mainVideoRef, uiStatus, wake } = useTotemController();

  const booting = uiStatus.bootStatus === 'loading' || uiStatus.bootStatus === 'error';
  const showRecognition = uiStatus.state === 'RECOGNITION' && !booting;
  // Evita display:none no <video> (iOS: play/zoom instável).
  const recognitionLayerClass = showRecognition
    ? 'relative z-10 block'
    : 'pointer-events-none fixed left-0 top-0 z-0 h-px w-px overflow-hidden opacity-0';

  return (
    <>
      {booting && (
        <TotemBootView
          message={uiStatus.bootMessage || 'Carregando totem...'}
          error={uiStatus.bootStatus === 'error'}
        />
      )}

      {!booting && (
        <>
          <div className={recognitionLayerClass} aria-hidden={!showRecognition}>
            <TotemRecognitionView status={uiStatus} videoRef={mainVideoRef} />
          </div>

          {uiStatus.state === 'IDLE' && <TotemIdleView onWake={wake} />}
          {uiStatus.state === 'WAKE' && <TotemWakeView />}
          {(uiStatus.state === 'CONFIRMATION' || uiStatus.state === 'RESET') && (
            <TotemConfirmationView status={uiStatus} />
          )}
        </>
      )}
    </>
  );
}
