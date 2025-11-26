import { useState, useEffect } from "react";
import { formatDateBR, getTodayDateString } from "@/utils/timeClockUtils";

export function DigitalClock() {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

  useEffect(() => {
    function updateTime() {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      setCurrentTime(`${hours}:${minutes}:${seconds}`);
      setCurrentDate(formatDateBR(getTodayDateString()));
    }

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center space-y-2 py-6">
      <div className="text-5xl md:text-6xl font-bold text-primary tracking-wider font-mono animate-in fade-in duration-300">
        {currentTime}
      </div>
      <div className="text-lg text-muted-foreground font-medium">
        {currentDate}
      </div>
    </div>
  );
}
