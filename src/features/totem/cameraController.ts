export interface CameraSession {
  stream: MediaStream;
  stop: () => void;
}

/**
 * Aguarda dimensões reais do vídeo (Safari iOS costuma demorar após play()).
 * Não rejeita: após timeout segue para não travar o totem.
 */
export function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const done = () =>
      video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

    if (done()) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('loadeddata', onMeta);
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
    video.addEventListener('loadeddata', onMeta);
    video.addEventListener('resize', onMeta);
    video.addEventListener('canplay', onMeta);
  });
}

function prepareVideoElement(video: HTMLVideoElement) {
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  // Evita “pulo” de enquadramento enquanto o track estabiliza
  video.style.objectFit = 'contain';
}

const CONSTRAINT_FALLBACKS: MediaStreamConstraints[] = [
  {
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24, max: 30 },
    },
  },
  {
    audio: false,
    video: { facingMode: 'user' },
  },
  {
    audio: false,
    video: true,
  },
];

async function getStream(preferred?: MediaStreamConstraints): Promise<MediaStream> {
  const attempts = preferred ? [preferred, ...CONSTRAINT_FALLBACKS] : CONSTRAINT_FALLBACKS;
  let lastError: unknown;

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Não foi possível acessar a câmera');
}

export async function startCamera(
  video: HTMLVideoElement,
  constraints?: MediaStreamConstraints
): Promise<CameraSession> {
  prepareVideoElement(video);

  // Libera stream anterior no mesmo elemento (evita zoom/flicker ao reabrir).
  const previous = video.srcObject;
  if (previous instanceof MediaStream) {
    previous.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }

  const stream = await getStream(constraints);
  video.srcObject = stream;

  try {
    await video.play();
  } catch {
    // Alguns browsers só liberam play após gesto; o totem já costuma ter gesto no wake.
  }

  await waitForVideoReady(video);

  // Aguarda um frame estável após metadata (reduz “zoom” na 1ª liberação da câmera).
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

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
