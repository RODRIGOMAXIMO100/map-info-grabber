import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';
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

interface ClosedValueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  estimatedValue: number | null;
  onSave: (closedValue: number | null) => void;
  onCancel: () => void;
}

const QUICK_VALUES = [500, 1000, 2000, 5000, 10000, 20000];

export function ClosedValueModal({ 
  open, 
  onOpenChange, 
  leadName, 
  estimatedValue, 
  onSave,
  onCancel 
}: ClosedValueModalProps) {
  const [value, setValue] = useState<string>('');

  // Pre-fill with estimated value when modal opens
  useEffect(() => {
    if (open && estimatedValue) {
      setValue(estimatedValue.toString());
    } else if (open) {
      setValue('');
    }
  }, [open, estimatedValue]);

  const handleQuickValue = (quickValue: number) => {
    onSave(quickValue);
    onOpenChange(false);
  };

  const handleSave = () => {
    const numValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
    onSave(isNaN(numValue) ? null : numValue);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleCancel();
      else onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Venda Fechada! 🎉
          </DialogTitle>
          <DialogDescription>
            Defina o valor real da venda para <strong>{leadName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Show estimated value if exists */}
          {estimatedValue && (
            <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Valor estimado:</span>
              <span className="font-medium">
                R$ {estimatedValue.toLocaleString('pt-BR')}
              </span>
            </div>
          )}

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
            <Label htmlFor="closed-value">Valor da venda:</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  R$
                </span>
                <Input
                  id="closed-value"
                  type="text"
                  placeholder="0,00"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="pl-10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSave();
                    }
                  }}
                />
              </div>
              <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
                <DollarSign className="h-4 w-4 mr-1" />
                Confirmar
              </Button>
            </div>
          </div>

          {/* Skip Button */}
          <Button 
            variant="ghost" 
            className="w-full text-muted-foreground"
            onClick={handleCancel}
          >
            Pular (não definir valor)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
