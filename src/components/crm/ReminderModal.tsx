import { useState, useMemo } from 'react';
import { format, addHours, addMinutes, addDays, setHours, setMinutes, formatDistanceToNow, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Calendar, Bell, Trash2, MessageCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ReminderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  onSave: (date: Date) => void;
  onRemove?: () => void;
  currentReminder?: string | null;
  lastContactAt?: string | null;
}

export function ReminderModal({ 
  open, 
  onOpenChange, 
  leadName, 
  onSave, 
  onRemove,
  currentReminder,
  lastContactAt,
}: ReminderModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [customTime, setCustomTime] = useState('09:00');
  const [mode, setMode] = useState<'quick' | 'custom'>('quick');

  // Calculate today at midnight to allow same-day scheduling
  const today = useMemo(() => startOfDay(new Date()), []);

  const quickOptions = [
    { label: 'Em 30 min', getValue: () => addMinutes(new Date(), 30) },
    { label: 'Em 1 hora', getValue: () => addHours(new Date(), 1) },
    { label: 'Em 2 horas', getValue: () => addHours(new Date(), 2) },
    { label: 'Em 4 horas', getValue: () => addHours(new Date(), 4) },
    { label: 'Amanhã 9h', getValue: () => setHours(setMinutes(addDays(new Date(), 1), 0), 9) },
    { label: 'Amanhã 14h', getValue: () => setHours(setMinutes(addDays(new Date(), 1), 0), 14) },
    { label: 'Em 2 dias', getValue: () => setHours(setMinutes(addDays(new Date(), 2), 0), 9) },
    { label: 'Próxima semana', getValue: () => setHours(setMinutes(addDays(new Date(), 7), 0), 9) },
  ];

  const handleQuickSelect = (getValue: () => Date) => {
    onSave(getValue());
    onOpenChange(false);
  };

  const handleCustomSave = () => {
    if (!selectedDate) return;
    
    const [hours, minutes] = customTime.split(':').map(Number);
    const dateWithTime = setHours(setMinutes(selectedDate, minutes), hours);
    onSave(dateWithTime);
    onOpenChange(false);
  };

  const handleRemove = () => {
    onRemove?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Agendar Lembrete
          </DialogTitle>
          <DialogDescription>
            Lembrar de entrar em contato com <strong>{leadName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Last Contact Info */}
          {lastContactAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>
                Último contato: {formatDistanceToNow(new Date(lastContactAt), { addSuffix: true, locale: ptBR })}
              </span>
            </div>
          )}

          {/* Current Reminder Info */}
          {currentReminder && (
            <div className="flex items-center justify-between gap-2 text-sm bg-primary/10 rounded-md p-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span>
                  Lembrete atual: <strong>{format(new Date(currentReminder), "dd/MM 'às' HH:mm", { locale: ptBR })}</strong>
                </span>
              </div>
              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleRemove}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remover
                </Button>
              )}
            </div>
          )}

          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'quick' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMode('quick')}
            >
              <Clock className="h-4 w-4 mr-1" />
              Rápido
            </Button>
            <Button
              variant={mode === 'custom' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMode('custom')}
            >
              <Calendar className="h-4 w-4 mr-1" />
              Personalizado
            </Button>
          </div>

          {mode === 'quick' ? (
            <div className="grid grid-cols-2 gap-2">
              {quickOptions.map((option) => (
                <Button
                  key={option.label}
                  variant="outline"
                  className="h-auto py-2.5 flex flex-col items-center gap-0.5"
                  onClick={() => handleQuickSelect(option.getValue)}
                >
                  <span className="text-xs font-medium">{option.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(option.getValue(), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={ptBR}
                disabled={(date) => date < today}
                className={cn("rounded-md border p-3 pointer-events-auto")}
              />

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label htmlFor="time" className="text-sm">Horário</Label>
                  <Input
                    id="time"
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button 
                  onClick={handleCustomSave} 
                  disabled={!selectedDate}
                  className="mt-6"
                >
                  Salvar
                </Button>
              </div>

              {selectedDate && (
                <p className="text-sm text-muted-foreground text-center">
                  Lembrete para: {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })} às {customTime}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
