import { useState, useEffect } from "react";
import { Employee, TimeRecord, TimeRecordType } from "@/types/timeClock";
import { getEmployees, getTimeRecordsByEmployeeAndDate, registerWithPhoto } from "@/services/timeClockService";
import { getTodayDateString, getNextRecordTypeForEmployee, getCurrentTimeString } from "@/utils/timeClockUtils";

export function useTimeClock() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [todayRecords, setTodayRecords] = useState<TimeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load employees on mount
  useEffect(() => {
    loadEmployees();
  }, []);

  // Load today's records when employee changes
  useEffect(() => {
    if (selectedEmployeeId) {
      loadTodayRecords();
    } else {
      setTodayRecords([]);
    }
  }, [selectedEmployeeId]);

  async function loadEmployees() {
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error("Error loading employees:", error);
    }
  }

  async function loadTodayRecords() {
    if (!selectedEmployeeId) return;

    try {
      setIsLoading(true);
      const today = getTodayDateString();
      const records = await getTimeRecordsByEmployeeAndDate(selectedEmployeeId, today);
      setTodayRecords(records);
    } catch (error) {
      console.error("Error loading today's records:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function canRegister(): { canRegister: boolean; message?: string; nextType?: TimeRecordType } {
    if (!selectedEmployeeId) {
      return {
        canRegister: false,
        message: "Selecione um colaborador antes de registrar o ponto.",
      };
    }

    const nextType = getNextRecordTypeForEmployee(todayRecords);

    if (!nextType) {
      return {
        canRegister: false,
        message: "Você já registrou todos os horários de hoje.",
      };
    }

    return { canRegister: true, nextType };
  }

  async function registerTimeRecordWithPhoto(photo: Blob): Promise<{ success: boolean; message: string; type?: string }> {
    const check = canRegister();
    
    if (!check.canRegister || !check.nextType) {
      return {
        success: false,
        message: check.message || "Erro ao verificar registro.",
      };
    }

    try {
      setIsLoading(true);
      
      const newRecord = await registerWithPhoto({
        employeeId: selectedEmployeeId,
        recordType: check.nextType,
        date: getTodayDateString(),
        time: getCurrentTimeString(),
        photo,
      });

      await loadTodayRecords();

      return {
        success: true,
        message: `${getRecordTypeLabel(check.nextType)} registrada com foto às ${newRecord.time}`,
        type: check.nextType,
      };
    } catch (error) {
      console.error("Error registering time record with photo:", error);
      return {
        success: false,
        message: "Erro ao registrar ponto. Tente novamente.",
      };
    } finally {
      setIsLoading(false);
    }
  }

  function getRecordTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      ENTRADA: "Entrada",
      SAIDA_ALMOCO: "Saída para Almoço",
      VOLTA_ALMOCO: "Volta do Almoço",
      SAIDA_FINAL: "Saída Final",
    };
    return labels[type] || type;
  }

  const nextRecordType = getNextRecordTypeForEmployee(todayRecords);

  return {
    employees,
    selectedEmployeeId,
    setSelectedEmployeeId,
    todayRecords,
    isLoading,
    canRegister,
    registerTimeRecordWithPhoto,
    nextRecordType,
    getRecordTypeLabel,
  };
}
