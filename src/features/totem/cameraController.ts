export interface CameraSession {
  stream: MediaStream;
  stop: () => void;
}

export async function startCamera(
  video: HTMLVideoElement,
  constraints: MediaStreamConstraints
): Promise<CameraSession> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();

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
