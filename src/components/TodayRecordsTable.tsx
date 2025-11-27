import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimeRecord, RECORD_TYPE_LABELS } from "@/types/timeClock";
import { Camera } from "lucide-react";
import { PhotoPreviewModal } from "./PhotoPreviewModal";
import { Button } from "./ui/button";

interface TodayRecordsTableProps {
  records: TimeRecord[];
  isLoading: boolean;
}

export function TodayRecordsTable({ records, isLoading }: TodayRecordsTableProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; type: string; time: string } | null>(null);

  if (isLoading) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        Carregando registros...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        Nenhum registro de ponto hoje.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Registros de Hoje</h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Tipo</TableHead>
                <TableHead className="font-semibold text-right">Horário</TableHead>
                <TableHead className="font-semibold text-center w-[60px]">Foto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">
                    {RECORD_TYPE_LABELS[record.type]}
                  </TableCell>
                  <TableCell className="text-right font-mono">{record.time}</TableCell>
                  <TableCell className="text-center">
                    {record.photoUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setSelectedPhoto({
                          url: record.photoUrl!,
                          type: RECORD_TYPE_LABELS[record.type],
                          time: record.time,
                        })}
                        title="Ver foto"
                      >
                        <Camera className="h-4 w-4 text-primary" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedPhoto && (
        <PhotoPreviewModal
          isOpen={!!selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          photoUrl={selectedPhoto.url}
          recordType={selectedPhoto.type}
          time={selectedPhoto.time}
        />
      )}
    </>
  );
}
