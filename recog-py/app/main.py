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
from PIL import Image, ImageOps

logger = logging.getLogger("recog-py")
logging.basicConfig(level=logging.INFO)

MODEL_NAME = os.getenv("MODEL_NAME", "Facenet512")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "opencv")
ALGORITHM = os.getenv("ALGORITHM", f"deepface-{MODEL_NAME.lower()}")

# Razões do rosto em relação à largura da imagem (guia oval no totem)
FACE_RATIO_MIN = float(os.getenv("FACE_RATIO_MIN", "0.22"))
FACE_RATIO_MAX = float(os.getenv("FACE_RATIO_MAX", "0.68"))
CENTER_TOL_X = float(os.getenv("CENTER_TOL_X", "0.18"))
CENTER_TOL_Y = float(os.getenv("CENTER_TOL_Y", "0.20"))

# Dimensões seguras — OpenCV Haar (cascadedetect) quebra em pirâmides inválidas
IMAGE_MAX_SIDE = int(os.getenv("IMAGE_MAX_SIDE", "960"))
IMAGE_MIN_SIDE = int(os.getenv("IMAGE_MIN_SIDE", "200"))

AlignStatus = Literal[
    "NO_FACE",
    "TOO_FAR",
    "TOO_CLOSE",
    "OFF_CENTER",
    "ALIGNED",
]

app = FastAPI(title="Ferrazcon Recog", version="1.1.0")

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
    detectorUsed: str | None = None


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


def _normalize_geometry(img_bgr: np.ndarray) -> np.ndarray:
    """Redimensiona para faixa estável e evita crash do OpenCV cascade."""
    if img_bgr is None or img_bgr.size == 0:
        raise HTTPException(status_code=400, detail="Imagem vazia")

    h, w = img_bgr.shape[:2]
    if h < 2 or w < 2:
        raise HTTPException(status_code=400, detail="Imagem inválida (dimensões muito pequenas)")

    long_side = max(h, w)
    short_side = min(h, w)
    scale = 1.0
    if long_side > IMAGE_MAX_SIDE:
        scale = IMAGE_MAX_SIDE / float(long_side)
    elif short_side < IMAGE_MIN_SIDE:
        scale = IMAGE_MIN_SIDE / float(short_side)

    if abs(scale - 1.0) > 1e-6:
        new_w = max(2, int(round(w * scale)))
        new_h = max(2, int(round(h * scale)))
        # Dimensões pares reduzem edge-cases no Haar pyramid
        new_w += new_w % 2
        new_h += new_h % 2
        interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR
        img_bgr = cv2.resize(img_bgr, (new_w, new_h), interpolation=interpolation)

    return np.ascontiguousarray(img_bgr)


def _decode_image(raw: str) -> np.ndarray:
    buf = _strip_data_url(raw)
    try:
        pil = Image.open(io.BytesIO(buf))
        pil = ImageOps.exif_transpose(pil)
        pil = pil.convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Não foi possível ler a imagem") from exc

    arr = np.asarray(pil)
    img_bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return _normalize_geometry(img_bgr)


def _detector_chain() -> list[str]:
    """opencv (rápido) → ssd (estável) → mtcnn (mais robusto)."""
    primary = (DETECTOR_BACKEND or "opencv").strip().lower()
    chain: list[str] = []
    for name in (primary, "ssd", "opencv", "mtcnn"):
        if name and name not in chain and name != "skip":
            chain.append(name)
    return chain


def _is_detector_crash(exc: BaseException) -> bool:
    msg = str(exc).lower().replace(" ", "")
    needles = (
        "getscaledata",
        "scaleidx",
        "cascadedetect",
        "assertionfailed",
        "error:(-215",
    )
    return any(n in msg for n in needles)


def _extract_faces_resilient(img_bgr: np.ndarray) -> tuple[list[Any], str]:
    from deepface import DeepFace

    last_exc: BaseException | None = None
    for detector in _detector_chain():
        try:
            faces = DeepFace.extract_faces(
                img_path=img_bgr,
                detector_backend=detector,
                enforce_detection=False,
                align=True,
            )
            return faces or [], detector
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            level = logging.WARNING if _is_detector_crash(exc) else logging.INFO
            logger.log(level, "extract_faces detector=%s falhou: %s", detector, exc)
            continue

    detail = "Não foi possível detectar o rosto nesta foto. Tente outra foto ou a câmera."
    if last_exc is not None and _is_detector_crash(last_exc):
        detail = (
            "Falha no detector OpenCV nesta imagem. "
            "Envie outra foto (rosto de frente, boa luz) ou use a câmera do celular."
        )
    raise HTTPException(status_code=400, detail=detail) from last_exc


def _ensure_model() -> None:
    global _model_ready
    if _model_ready:
        return
    from deepface import DeepFace

    logger.info("Warming DeepFace model=%s detector=%s", MODEL_NAME, DETECTOR_BACKEND)
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
        # Tenta warm-up com SSD se OpenCV falhar no dummy
        try:
            DeepFace.represent(
                img_path=dummy,
                model_name=MODEL_NAME,
                detector_backend="ssd",
                enforce_detection=False,
            )
        except Exception as exc2:  # noqa: BLE001
            logger.warning("Warm-up SSD também falhou: %s", exc2)
    _model_ready = True
    logger.info("DeepFace pronto")


def _pick_best_face(faces: list[Any]) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_area = -1.0
    for face in faces:
        fa = face.get("facial_area") or {}
        fw = float(fa.get("w") or 0)
        fh = float(fa.get("h") or 0)
        area = fw * fh
        conf = float(face.get("confidence") or 0)
        # confidence do OpenCV/SSD varia; não descarte agressivamente
        if conf > 0 and conf < 0.15:
            continue
        if area > best_area:
            best_area = area
            best = face
    return best


def _analyze_alignment(img_bgr: np.ndarray) -> DetectResponse:
    h, w = img_bgr.shape[:2]
    faces, detector_used = _extract_faces_resilient(img_bgr)

    if not faces:
        return DetectResponse(
            hasFace=False,
            alignStatus="NO_FACE",
            message="Nenhum rosto detectado. Encaixe o rosto no oval.",
            detectorUsed=detector_used,
        )

    best = _pick_best_face(faces)
    if not best:
        return DetectResponse(
            hasFace=False,
            alignStatus="NO_FACE",
            message="Nenhum rosto detectado. Encaixe o rosto no oval.",
            detectorUsed=detector_used,
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
            detectorUsed=detector_used,
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
            detectorUsed=detector_used,
        )
    if face_ratio > FACE_RATIO_MAX:
        return DetectResponse(
            hasFace=True,
            alignStatus="TOO_CLOSE",
            message="Afaste um pouco o rosto",
            faceRatio=face_ratio,
            centerX=cx,
            centerY=cy,
            detectorUsed=detector_used,
        )
    if abs(cx - 0.5) > CENTER_TOL_X or abs(cy - 0.5) > CENTER_TOL_Y:
        return DetectResponse(
            hasFace=True,
            alignStatus="OFF_CENTER",
            message="Centralize o rosto no oval",
            faceRatio=face_ratio,
            centerX=cx,
            centerY=cy,
            detectorUsed=detector_used,
        )

    return DetectResponse(
        hasFace=True,
        alignStatus="ALIGNED",
        message="Rosto alinhado. Segure firme...",
        faceRatio=face_ratio,
        centerX=cx,
        centerY=cy,
        detectorUsed=detector_used,
    )


def _embed(img_bgr: np.ndarray, *, enforce_detection: bool = True) -> tuple[list[float], str]:
    from deepface import DeepFace

    last_exc: BaseException | None = None
    for detector in _detector_chain():
        try:
            reps = DeepFace.represent(
                img_path=img_bgr,
                model_name=MODEL_NAME,
                detector_backend=detector,
                enforce_detection=enforce_detection,
                align=True,
            )
            if not reps:
                continue
            emb = reps[0].get("embedding")
            if not emb:
                continue
            vec = np.asarray(emb, dtype=np.float64)
            mag = np.linalg.norm(vec)
            if mag == 0:
                continue
            return (vec / mag).tolist(), detector
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            logger.warning("represent detector=%s falhou: %s", detector, exc)
            continue

    # Último recurso no cadastro: sem enforce
    if enforce_detection:
        try:
            return _embed(img_bgr, enforce_detection=False)
        except HTTPException:
            pass

    raise HTTPException(
        status_code=400,
        detail="Não foi possível extrair o rosto. Use foto de frente, boa luz, sem óculos escuros.",
    ) from last_exc


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
        "detectors": _detector_chain(),
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

    try:
        alignment = _analyze_alignment(img)
    except HTTPException as exc:
        # No cadastro (requireAligned=False) ainda tenta gerar embedding
        if payload.requireAligned:
            raise
        logger.warning("align falhou no enroll, tentando embed direto: %s", exc.detail)
        embedding, detector_used = _embed(img, enforce_detection=False)
        return EmbedResponse(
            embedding=embedding,
            algorithm=ALGORITHM,
            model=MODEL_NAME,
            detector=detector_used,
        )

    if not alignment.hasFace:
        if payload.requireAligned:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": alignment.message,
                    "alignStatus": alignment.alignStatus,
                    "hasFace": False,
                },
            )
        embedding, detector_used = _embed(img, enforce_detection=False)
        return EmbedResponse(
            embedding=embedding,
            algorithm=ALGORITHM,
            model=MODEL_NAME,
            detector=detector_used,
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
        embedding, detector_used = _embed(img, enforce_detection=True)
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
        detector=detector_used,
    )
