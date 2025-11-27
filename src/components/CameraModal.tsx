import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, Check, Upload, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (photoBlob: Blob) => void;
  recordTypeLabel: string;
}

export function CameraModal({ isOpen, onClose, onConfirm, recordTypeLabel }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          setCameraError("Permissão de câmera negada. Use o upload de arquivo como alternativa.");
        } else if (error.name === "NotFoundError") {
          setCameraError("Nenhuma câmera encontrada. Use o upload de arquivo como alternativa.");
        } else {
          setCameraError("Erro ao acessar câmera. Use o upload de arquivo como alternativa.");
        }
      } else {
        setCameraError("Erro inesperado. Use o upload de arquivo como alternativa.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !capturedPhoto) {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, capturedPhoto, startCamera, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPhoto(null);
      setPhotoPreviewUrl(null);
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
        if (blob) {
          setCapturedPhoto(blob);
          setPhotoPreviewUrl(URL.createObjectURL(blob));
          stopCamera();
        }
      },
      "image/jpeg",
      0.8
    );
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setCapturedPhoto(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
      stopCamera();
    }
  };

  const retakePhoto = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setCapturedPhoto(null);
    setPhotoPreviewUrl(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedPhoto) {
      onConfirm(capturedPhoto);
    }
  };

  const handleClose = () => {
    stopCamera();
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-primary flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Confirme seu registro de ponto
          </DialogTitle>
          <DialogDescription>
            {recordTypeLabel} - Ative a câmera, tire uma foto e confirme o registro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera/Preview Area */}
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {!capturedPhoto && !cameraError && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            )}

            {capturedPhoto && photoPreviewUrl && (
              <img
                src={photoPreviewUrl}
                alt="Foto capturada"
                className="w-full h-full object-cover"
              />
            )}

            {cameraError && !capturedPhoto && (
              <div className="text-center p-4">
                <Camera className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{cameraError}</p>
              </div>
            )}
          </div>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            {!capturedPhoto && !cameraError && (
              <Button
                onClick={capturePhoto}
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                <Camera className="w-4 h-4 mr-2" />
                Capturar foto
              </Button>
            )}

            {capturedPhoto && (
              <>
                <Button
                  onClick={handleConfirm}
                  className="w-full"
                  size="lg"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Confirmar registro de ponto
                </Button>
                <Button
                  onClick={retakePhoto}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Tirar outra foto
                </Button>
              </>
            )}

            {(cameraError || !capturedPhoto) && (
              <>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="w-full"
                >
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

          {/* LGPD Notice */}
          <p className="text-xs text-muted-foreground text-center border-t pt-3">
            As imagens capturadas são utilizadas exclusivamente para controle interno de ponto da Ferrazcon Contabilidade, em conformidade com a LGPD.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
