"""
Serviço de biometria facial — DeepFace (Facenet512).
Expõe detect/embed para o Node; imagens não são persistidas.
"""

from __future__ import annotations

import base64
import io
import logging
import os
from typing import Any, Literal

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from PIL import Image

logger = logging.getLogger("recog-py")
logging.basicConfig(level=logging.INFO)

MODEL_NAME = os.getenv("MODEL_NAME", "Facenet512")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "opencv")
ALGORITHM = os.getenv("ALGORITHM", f"deepface-{MODEL_NAME.lower()}")

# Razões do rosto em relação à largura da imagem (guia oval no totem)
FACE_RATIO_MIN = float(os.getenv("FACE_RATIO_MIN", "0.28"))
FACE_RATIO_MAX = float(os.getenv("FACE_RATIO_MAX", "0.58"))
CENTER_TOL_X = float(os.getenv("CENTER_TOL_X", "0.14"))
CENTER_TOL_Y = float(os.getenv("CENTER_TOL_Y", "0.16"))

AlignStatus = Literal[
    "NO_FACE",
    "TOO_FAR",
    "TOO_CLOSE",
    "OFF_CENTER",
    "ALIGNED",
]

app = FastAPI(title="Ferrazcon Recog", version="1.0.0")

_model_ready = False


class ImagePayload(BaseModel):
    imageBase64: str = Field(..., description="JPEG/PNG em base64 (com ou sem data URL)")


class DetectResponse(BaseModel):
    hasFace: bool
    alignStatus: AlignStatus
    message: str
    faceRatio: float | None = None
    centerX: float | None = None
    centerY: float | None = None


class EmbedResponse(BaseModel):
    embedding: list[float]
    algorithm: str
    model: str
    detector: str


def _strip_data_url(raw: str) -> bytes:
    data = raw.strip()
    if "," in data and data.startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        return base64.b64decode(data, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="imageBase64 inválido") from exc


def _decode_image(raw: str) -> np.ndarray:
    buf = _strip_data_url(raw)
    pil = Image.open(io.BytesIO(buf)).convert("RGB")
    arr = np.asarray(pil)
    # DeepFace/OpenCV esperam BGR em vários caminhos
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _ensure_model() -> None:
    global _model_ready
    if _model_ready:
        return
    from deepface import DeepFace

    logger.info("Warming DeepFace model=%s detector=%s", MODEL_NAME, DETECTOR_BACKEND)
    # Imagem sintética mínima para forçar download/carregamento dos pesos
    dummy = np.zeros((160, 160, 3), dtype=np.uint8)
    try:
        DeepFace.represent(
            img_path=dummy,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Warm-up com avisos: %s", exc)
    _model_ready = True
    logger.info("DeepFace pronto")


def _analyze_alignment(img_bgr: np.ndarray) -> DetectResponse:
    from deepface import DeepFace

    h, w = img_bgr.shape[:2]
    try:
        faces = DeepFace.extract_faces(
            img_path=img_bgr,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=False,
            align=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("extract_faces failed")
        raise HTTPException(status_code=500, detail=f"Falha na detecção: {exc}") from exc

    if not faces:
        return DetectResponse(
            hasFace=False,
            alignStatus="NO_FACE",
            message="Nenhum rosto detectado. Encaixe o rosto no oval.",
        )

    # Pega a maior face
    best: dict[str, Any] | None = None
    best_area = -1.0
    for face in faces:
        fa = face.get("facial_area") or {}
        fw = float(fa.get("w") or 0)
        fh = float(fa.get("h") or 0)
        area = fw * fh
        conf = float(face.get("confidence") or 0)
        if conf < 0.5 and DETECTOR_BACKEND != "opencv":
            continue
        if area > best_area:
            best_area = area
            best = face

    if not best:
        return DetectResponse(
            hasFace=False,
            alignStatus="NO_FACE",
            message="Nenhum rosto detectado. Encaixe o rosto no oval.",
        )

    fa = best.get("facial_area") or {}
    fx = float(fa.get("x") or 0)
    fy = float(fa.get("y") or 0)
    fw = float(fa.get("w") or 0)
    fh = float(fa.get("h") or 0)

    if fw <= 0 or fh <= 0 or w <= 0 or h <= 0:
        return DetectResponse(
            hasFace=False,
            alignStatus="NO_FACE",
            message="Nenhum rosto detectado. Encaixe o rosto no oval.",
        )

    cx = (fx + fw / 2.0) / w
    cy = (fy + fh / 2.0) / h
    face_ratio = fw / w

    if face_ratio < FACE_RATIO_MIN:
        return DetectResponse(
            hasFace=True,
            alignStatus="TOO_FAR",
            message="Aproxime o rosto do oval",
            faceRatio=face_ratio,
            centerX=cx,
            centerY=cy,
        )
    if face_ratio > FACE_RATIO_MAX:
        return DetectResponse(
            hasFace=True,
            alignStatus="TOO_CLOSE",
            message="Afaste um pouco o rosto",
            faceRatio=face_ratio,
            centerX=cx,
            centerY=cy,
        )
    if abs(cx - 0.5) > CENTER_TOL_X or abs(cy - 0.5) > CENTER_TOL_Y:
        return DetectResponse(
            hasFace=True,
            alignStatus="OFF_CENTER",
            message="Centralize o rosto no oval",
            faceRatio=face_ratio,
            centerX=cx,
            centerY=cy,
        )

    return DetectResponse(
        hasFace=True,
        alignStatus="ALIGNED",
        message="Rosto alinhado. Segure firme...",
        faceRatio=face_ratio,
        centerX=cx,
        centerY=cy,
    )


def _embed(img_bgr: np.ndarray) -> list[float]:
    from deepface import DeepFace

    reps = DeepFace.represent(
        img_path=img_bgr,
        model_name=MODEL_NAME,
        detector_backend=DETECTOR_BACKEND,
        enforce_detection=True,
        align=True,
    )
    if not reps:
        raise HTTPException(status_code=400, detail="Não foi possível gerar embedding")
    emb = reps[0].get("embedding")
    if not emb:
        raise HTTPException(status_code=400, detail="Embedding vazio")
    # Normaliza L2
    vec = np.asarray(emb, dtype=np.float64)
    mag = np.linalg.norm(vec)
    if mag == 0:
        raise HTTPException(status_code=400, detail="Embedding com magnitude zero")
    return (vec / mag).tolist()


@app.on_event("startup")
def on_startup() -> None:
    try:
        _ensure_model()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falha no warm-up (continua e tenta sob demanda): %s", exc)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "detector": DETECTOR_BACKEND,
        "algorithm": ALGORITHM,
        "ready": _model_ready,
    }


@app.post("/detect", response_model=DetectResponse)
def detect(payload: ImagePayload) -> DetectResponse:
    _ensure_model()
    img = _decode_image(payload.imageBase64)
    return _analyze_alignment(img)


class EmbedRequest(ImagePayload):
    requireAligned: bool = True


@app.post("/embed", response_model=EmbedResponse)
def embed(payload: EmbedRequest) -> EmbedResponse:
    _ensure_model()
    img = _decode_image(payload.imageBase64)
    alignment = _analyze_alignment(img)
    if not alignment.hasFace:
        raise HTTPException(
            status_code=422,
            detail={
                "message": alignment.message,
                "alignStatus": alignment.alignStatus,
                "hasFace": False,
            },
        )
    if payload.requireAligned and alignment.alignStatus != "ALIGNED":
        raise HTTPException(
            status_code=422,
            detail={
                "message": alignment.message,
                "alignStatus": alignment.alignStatus,
                "hasFace": alignment.hasFace,
                "faceRatio": alignment.faceRatio,
            },
        )
    try:
        embedding = _embed(img)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("embed failed")
        raise HTTPException(
            status_code=400,
            detail="Não foi possível extrair o rosto. Ajuste iluminação e tente de novo.",
        ) from exc
    return EmbedResponse(
        embedding=embedding,
        algorithm=ALGORITHM,
        model=MODEL_NAME,
        detector=DETECTOR_BACKEND,
    )
