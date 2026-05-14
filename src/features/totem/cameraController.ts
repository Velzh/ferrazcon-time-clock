export interface CameraSession {
  stream: MediaStream;
  stop: () => void;
}

/**
 * Aguarda dimensões reais do vídeo (Safari iOS costuma demorar após play()).
 * Não rejeita: após timeout segue para não travar o totem.
 */
export function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        return true;
      }
      return false;
    };

    if (done()) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('resize', onMeta);
      video.removeEventListener('canplay', onMeta);
      window.clearTimeout(timer);
      resolve();
    };

    const onMeta = () => {
      if (done()) finish();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('resize', onMeta);
    video.addEventListener('canplay', onMeta);
  });
}

export async function startCamera(
  video: HTMLVideoElement,
  constraints: MediaStreamConstraints
): Promise<CameraSession> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  await waitForVideoReady(video);

  return {
    stream,
    stop: () => {
      stream.getTracks().forEach((track) => track.stop());
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    },
  };
}
