import { Employee } from "@/types/timeClock";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EmployeeSelectorProps {
  employees: Employee[];
  selectedEmployeeId: string;
  onSelectEmployee: (employeeId: string) => void;
  disabled?: boolean;
}

export function EmployeeSelector({
  employees,
  selectedEmployeeId,
  onSelectEmployee,
  disabled = false,
}: EmployeeSelectorProps) {
  return (
    <div className="space-y-2">
      <label htmlFor="employee-select" className="text-sm font-medium text-foreground">
        Colaborador
      </label>
      <Select value={selectedEmployeeId} onValueChange={onSelectEmployee} disabled={disabled}>
        <SelectTrigger id="employee-select" className="w-full">
          <SelectValue placeholder="Selecione um colaborador" />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          {employees.map((employee) => (
            <SelectItem key={employee.id} value={employee.id}>
              {employee.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
