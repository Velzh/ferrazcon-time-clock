interface MotionOptions {
  threshold?: number;
  sampleStep?: number;
  sampleIntervalMs?: number;
}

export interface MotionDetector {
  stop: () => void;
}

export function startMotionDetector(
  video: HTMLVideoElement,
  onMotion: () => void,
  options?: MotionOptions
): MotionDetector {
  const threshold = options?.threshold ?? 14;
  const sampleStep = options?.sampleStep ?? 24;
  const sampleIntervalMs = options?.sampleIntervalMs ?? 450;

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let prev: Uint8ClampedArray | null = null;
  let timer: number | null = null;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    if (!ctx || video.readyState < 2) {
      timer = window.setTimeout(tick, sampleIntervalMs);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    if (prev) {
      let acc = 0;
      let count = 0;
      for (let i = 0; i < frame.length; i += sampleStep) {
        acc += Math.abs(frame[i] - prev[i]);
        count += 1;
      }

      const diff = count ? acc / count : 0;
      if (diff > threshold) {
        onMotion();
      }
    }

    prev = new Uint8ClampedArray(frame);
    timer = window.setTimeout(tick, sampleIntervalMs);
  };

  tick();

  return {
    stop: () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    },
  };
}
