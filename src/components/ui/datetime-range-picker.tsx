import * as React from "react";
import { format, startOfDay, endOfDay, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface DateTimeRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onApply: (startDate: Date | null, endDate: Date | null) => void;
  onClear: () => void;
}

export function DateTimeRangePicker({
  startDate: initialStartDate,
  endDate: initialEndDate,
  onApply,
  onClear,
}: DateTimeRangePickerProps) {
  const [startDate, setStartDate] = React.useState<Date | undefined>(
    initialStartDate || undefined
  );
  const [endDate, setEndDate] = React.useState<Date | undefined>(
    initialEndDate || undefined
  );
  const [startTime, setStartTime] = React.useState(
    initialStartDate ? format(initialStartDate, "HH:mm") : "00:00"
  );
  const [endTime, setEndTime] = React.useState(
    initialEndDate ? format(initialEndDate, "HH:mm") : "23:59"
  );

  const combineDateAndTime = (date: Date | undefined, time: string): Date | null => {
    if (!date) return null;
    const [hours, minutes] = time.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  };

  const handleApply = () => {
    const start = combineDateAndTime(startDate, startTime);
    const end = combineDateAndTime(endDate, endTime);
    onApply(start, end);
  };

  const handleClear = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime("00:00");
    setEndTime("23:59");
    onClear();
  };

  const applyQuickFilter = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
    setStartTime(format(start, "HH:mm"));
    setEndTime(format(end, "HH:mm"));
  };

  const quickFilters = [
    {
      label: "Hoje",
      action: () => {
        const now = new Date();
        applyQuickFilter(startOfDay(now), now);
      },
    },
    {
      label: "Ontem",
      action: () => {
        const yesterday = subDays(new Date(), 1);
        applyQuickFilter(startOfDay(yesterday), endOfDay(yesterday));
      },
    },
    {
      label: "7 dias",
      action: () => {
        const now = new Date();
        applyQuickFilter(startOfDay(subDays(now, 7)), now);
      },
    },
    {
      label: "Este mês",
      action: () => {
        const now = new Date();
        applyQuickFilter(startOfMonth(now), now);
      },
    },
  ];

  return (
    <div className="p-4 space-y-4 w-[320px]">
      {/* Quick Filters */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Atalhos</Label>
        <div className="flex flex-wrap gap-1.5">
          {quickFilters.map((filter) => (
            <Button
              key={filter.label}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={filter.action}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Date Range Selection */}
      <div className="grid grid-cols-2 gap-4">
        {/* Start Date */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={setStartDate}
            locale={ptBR}
            className={cn("p-0 pointer-events-auto [&_.rdp-caption]:text-xs [&_.rdp-day]:h-7 [&_.rdp-day]:w-7 [&_.rdp-head_cell]:w-7 [&_.rdp-head_cell]:text-[10px] [&_.rdp-nav_button]:h-6 [&_.rdp-nav_button]:w-6")}
            classNames={{
              months: "flex flex-col",
              month: "space-y-2",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-xs font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100 border rounded-md",
              nav_button_previous: "absolute left-0",
              nav_button_next: "absolute right-0",
              table: "w-full border-collapse",
              head_row: "flex",
              head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[10px]",
              row: "flex w-full mt-1",
              cell: "h-7 w-7 text-center text-xs p-0 relative",
              day: "h-7 w-7 p-0 font-normal text-xs hover:bg-accent rounded-md",
              day_selected: "bg-primary text-primary-foreground hover:bg-primary",
              day_today: "bg-accent text-accent-foreground",
              day_outside: "text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50",
            }}
          />
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* End Date */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={setEndDate}
            locale={ptBR}
            className={cn("p-0 pointer-events-auto [&_.rdp-caption]:text-xs [&_.rdp-day]:h-7 [&_.rdp-day]:w-7 [&_.rdp-head_cell]:w-7 [&_.rdp-head_cell]:text-[10px] [&_.rdp-nav_button]:h-6 [&_.rdp-nav_button]:w-6")}
            classNames={{
              months: "flex flex-col",
              month: "space-y-2",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-xs font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100 border rounded-md",
              nav_button_previous: "absolute left-0",
              nav_button_next: "absolute right-0",
              table: "w-full border-collapse",
              head_row: "flex",
              head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[10px]",
              row: "flex w-full mt-1",
              cell: "h-7 w-7 text-center text-xs p-0 relative",
              day: "h-7 w-7 p-0 font-normal text-xs hover:bg-accent rounded-md",
              day_selected: "bg-primary text-primary-foreground hover:bg-primary",
              day_today: "bg-accent text-accent-foreground",
              day_outside: "text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50",
            }}
          />
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-8 text-xs"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Limpar
        </Button>
        <Button
          size="sm"
          onClick={handleApply}
          disabled={!startDate || !endDate}
          className="h-8 text-xs"
        >
          <CalendarIcon className="h-3.5 w-3.5 mr-1" />
          Aplicar
        </Button>
      </div>
    </div>
  );
}
