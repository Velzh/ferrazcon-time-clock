import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;

const MODEL_PATH = '/models';

export async function loadFaceModels() {
  if (modelsLoaded) return;
  try {
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH);
    modelsLoaded = true;
    console.log('Modelos de face carregados com sucesso');
  } catch (error) {
    console.error('Erro ao carregar modelos:', error);
    throw error;
  }
}

export async function getEmbeddingFromVideo(video: HTMLVideoElement) {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  try {
    const result = await faceapi
      .detectSingleFace(video)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!result) {
      return null;
    }

    const descriptor = Array.from(result.descriptor);
    
    // Normaliza o embedding
    const magnitude = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return descriptor.map((val) => val / magnitude);
    }

    return descriptor;
  } catch (error) {
    console.error('Erro ao gerar embedding do vídeo:', error);
    return null;
  }
}

export async function getEmbeddingFromCanvas(canvas: HTMLCanvasElement) {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  // Valida dimensões básicas
  if (!canvas.width || !canvas.height) {
    throw new Error('Canvas sem dimensões válidas');
  }

  try {
    const result = await faceapi
      .detectSingleFace(canvas)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!result) {
      throw new Error('Nenhuma face detectada na imagem');
    }

    const descriptor = Array.from(result.descriptor);
    
    // Normaliza o embedding
    const magnitude = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return descriptor.map((val) => val / magnitude);
    }

    return descriptor;
  } catch (error) {
    console.error('Erro ao gerar embedding do canvas:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro ao processar imagem');
  }
}

export function getFaceApi() {
  return faceapi;
}
