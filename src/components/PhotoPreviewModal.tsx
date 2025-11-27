import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera } from "lucide-react";

interface PhotoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  photoUrl: string;
  recordType: string;
  time: string;
}

export function PhotoPreviewModal({ isOpen, onClose, photoUrl, recordType, time }: PhotoPreviewModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Foto do Registro
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground text-center">
            {recordType} às {time}
          </div>
          <div className="aspect-video bg-muted rounded-lg overflow-hidden">
            <img
              src={photoUrl}
              alt={`Foto do registro de ${recordType}`}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
