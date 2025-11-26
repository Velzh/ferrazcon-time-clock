import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DigitalClock } from "./DigitalClock";
import { EmployeeSelector } from "./EmployeeSelector";
import { TodayRecordsTable } from "./TodayRecordsTable";
import { useTimeClock } from "@/hooks/useTimeClock";
import { useToast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";

export function TimeClockCard() {
  const {
    employees,
    selectedEmployeeId,
    setSelectedEmployeeId,
    todayRecords,
    isLoading,
    registerTimeRecord,
    nextRecordType,
    getRecordTypeLabel,
  } = useTimeClock();

  const { toast } = useToast();
  const [isRegistering, setIsRegistering] = useState(false);

  async function handleRegister() {
    setIsRegistering(true);
    const result = await registerTimeRecord();
    setIsRegistering(false);

    if (result.success) {
      toast({
        title: "Ponto Registrado!",
        description: result.message,
        variant: "default",
      });
    } else {
      toast({
        title: "Erro",
        description: result.message,
        variant: "destructive",
      });
    }
  }

  return (
    <Card className="w-full max-w-2xl shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader className="text-center border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
        <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center justify-center gap-2">
          <Clock className="w-7 h-7" />
          Registro de Ponto
        </CardTitle>
        <CardDescription className="text-base">
          Registre sua entrada e saída diária
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <DigitalClock />
        
        <EmployeeSelector
          employees={employees}
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={setSelectedEmployeeId}
          disabled={isLoading}
        />

        <div className="space-y-3">
          <Button
            onClick={handleRegister}
            disabled={!selectedEmployeeId || isRegistering || isLoading || !nextRecordType}
            className="w-full h-14 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
            size="lg"
          >
            {isRegistering ? "Registrando..." : "Registrar Ponto"}
          </Button>
          
          {selectedEmployeeId && nextRecordType && (
            <p className="text-center text-sm text-muted-foreground animate-in fade-in duration-300">
              Próximo registro: <span className="font-semibold text-accent">{getRecordTypeLabel(nextRecordType)}</span>
            </p>
          )}

          {selectedEmployeeId && !nextRecordType && (
            <p className="text-center text-sm text-muted-foreground animate-in fade-in duration-300">
              Todos os registros do dia foram concluídos
            </p>
          )}
        </div>

        {selectedEmployeeId && (
          <div className="pt-4 border-t border-border animate-in fade-in slide-in-from-bottom-2 duration-500">
            <TodayRecordsTable records={todayRecords} isLoading={isLoading} />
          </div>
        )}

        <div className="pt-4 text-center text-xs text-muted-foreground border-t border-border">
          Este ambiente é de uso interno da Ferrazcon Contabilidade. Os dados exibidos são limitados e utilizados apenas para fins de registro de ponto.
        </div>
      </CardContent>
    </Card>
  );
}
