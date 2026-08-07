import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, Check, Upload, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Uma foto (modo simples) ou lista quando requiredCaptures > 1 */
  onConfirm: (photoBlob: Blob | Blob[]) => void;
  recordTypeLabel: string;
  /** Quantas capturas pedir (ex.: 3 para biometria Python) */
  requiredCaptures?: number;
  captureHints?: string[];
}

function OvalOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <mask id="admin-oval-mask">
            <rect width="100" height="100" fill="white" />
            <ellipse cx="50" cy="48" rx="30" ry="38" fill="black" />
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(15,23,42,0.55)" mask="url(#admin-oval-mask)" />
        <ellipse cx="50" cy="48" rx="30" ry="38" fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

export function CameraModal({
  isOpen,
  onClose,
  onConfirm,
  recordTypeLabel,
  requiredCaptures = 1,
  captureHints,
}: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedPhotos, setCapturedPhotos] = useState<Blob[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const currentIndex = capturedPhotos.length;
  const done = currentIndex >= requiredCaptures;
  const hint =
    captureHints?.[Math.min(currentIndex, (captureHints?.length ?? 1) - 1)] ??
    `Foto ${currentIndex + 1} de ${requiredCaptures} — encaixe o rosto no oval`;

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error("Camera access error:", error);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setCameraError("Permissão de câmera negada. Use o upload de arquivo.");
      } else if (error instanceof DOMException && error.name === "NotFoundError") {
        setCameraError("Nenhuma câmera encontrada. Use o upload de arquivo.");
      } else {
        setCameraError("Erro ao acessar câmera. Use o upload de arquivo.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !done) {
      void startCamera();
    }
    return () => stopCamera();
  }, [isOpen, done, startCamera, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPhotos([]);
      setPreviewUrl(null);
      setCameraError(null);
    }
  }, [isOpen, stopCamera]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const next = [...capturedPhotos, blob];
        setCapturedPhotos(next);
        setPreviewUrl(URL.createObjectURL(blob));
        if (next.length >= requiredCaptures) {
          stopCamera();
        }
      },
      "image/jpeg",
      0.85,
    );
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // iOS às vezes manda HEIC sem type; aceita qualquer arquivo de imagem selecionado
    if (file && (file.type.startsWith("image/") || !file.type)) {
      const next = [...capturedPhotos, file];
      setCapturedPhotos(next);
      setPreviewUrl(URL.createObjectURL(file));
      if (next.length >= requiredCaptures) {
        stopCamera();
      }
    }
    event.target.value = "";
  };

  const retakeAll = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedPhotos([]);
    setPreviewUrl(null);
    void startCamera();
  };

  const handleConfirm = () => {
    if (capturedPhotos.length < requiredCaptures) return;
    onConfirm(requiredCaptures === 1 ? capturedPhotos[0] : capturedPhotos);
  };

  const handleClose = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-primary flex items-center gap-2">
            <Camera className="w-5 h-5" />
            {recordTypeLabel}
          </DialogTitle>
          <DialogDescription>
            {requiredCaptures > 1
              ? `Serão necessárias ${requiredCaptures} fotos com o rosto no oval.`
              : "Encaixe o rosto no oval com boa iluminação."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground text-center font-medium">{done ? "Capturas concluídas" : hint}</p>

          <div className="relative aspect-[3/4] bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {!done && !cameraError && (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover [transform:scaleX(-1)]" />
                <OvalOverlay />
              </>
            )}

            {done && previewUrl && (
              <img src={previewUrl} alt="Última foto" className="max-w-full max-h-full object-contain" />
            )}

            {cameraError && !done && (
              <div className="text-center p-4">
                <Camera className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{cameraError}</p>
              </div>
            )}

            <div className="absolute left-2 top-2 rounded-full bg-black/60 text-white text-xs px-2 py-1">
              {Math.min(currentIndex, requiredCaptures)}/{requiredCaptures}
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex flex-col gap-2">
            {!done && !cameraError && (
              <Button onClick={capturePhoto} disabled={isLoading} className="w-full" size="lg">
                <Camera className="w-4 h-4 mr-2" />
                Capturar foto {currentIndex + 1}
              </Button>
            )}

            {done && (
              <>
                <Button onClick={handleConfirm} className="w-full" size="lg">
                  <Check className="w-4 h-4 mr-2" />
                  Confirmar biometria
                </Button>
                <Button onClick={retakeAll} variant="outline" className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refazer todas
                </Button>
              </>
            )}

            {!done && (
              <>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload de arquivo
                </Button>
              </>
            )}

            <Button onClick={handleClose} variant="ghost" className="w-full">
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center border-t pt-3">
            As imagens são usadas só para biometria e não ficam armazenadas como foto (LGPD).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
