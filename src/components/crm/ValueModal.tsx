import { useState } from 'react';
import { DollarSign } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ValueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  currentValue: number | null;
  onSave: (value: number | null) => void;
}

const QUICK_VALUES = [500, 1000, 2000, 5000, 10000, 20000];

export function ValueModal({ open, onOpenChange, leadName, currentValue, onSave }: ValueModalProps) {
  const [value, setValue] = useState<string>(currentValue?.toString() || '');

  const handleQuickValue = (quickValue: number) => {
    onSave(quickValue);
    onOpenChange(false);
  };

  const handleSave = () => {
    const numValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
    onSave(isNaN(numValue) ? null : numValue);
    onOpenChange(false);
  };

  const handleClear = () => {
    onSave(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Valor Estimado do Deal
          </DialogTitle>
          <DialogDescription>
            Defina o valor estimado para <strong>{leadName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick Values */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Valores rápidos:</p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_VALUES.map((quickValue) => (
                <Button
                  key={quickValue}
                  variant="outline"
                  className="h-auto py-2"
                  onClick={() => handleQuickValue(quickValue)}
                >
                  R$ {quickValue.toLocaleString('pt-BR')}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Value */}
          <div className="space-y-2">
            <Label htmlFor="value">Valor personalizado:</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  R$
                </span>
                <Input
                  id="value"
                  type="text"
                  placeholder="0,00"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="pl-10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSave();
                    }
                  }}
                />
              </div>
              <Button onClick={handleSave}>
                Salvar
              </Button>
            </div>
          </div>

          {/* Clear Button */}
          {currentValue && (
            <Button 
              variant="ghost" 
              className="w-full text-muted-foreground"
              onClick={handleClear}
            >
              Limpar valor
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}