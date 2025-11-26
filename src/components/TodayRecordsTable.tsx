import { TimeRecord, RECORD_TYPE_LABELS } from "@/types/timeClock";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TodayRecordsTableProps {
  records: TimeRecord[];
  isLoading: boolean;
}

export function TodayRecordsTable({ records, isLoading }: TodayRecordsTableProps) {
  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Carregando registros...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum registro hoje
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Registros de Hoje</h3>
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold text-right">Horário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium">{RECORD_TYPE_LABELS[record.type]}</TableCell>
                <TableCell className="text-right font-mono">{record.time}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
