import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { CRMFunnelStage } from '@/types/crm';

interface UndoSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  closedValue: number | null;
  stages: CRMFunnelStage[];
  currentStageId: string | null;
  onConfirm: (newStageId: string, clearClosedValue: boolean) => void;
}

export function UndoSaleModal({
  open,
  onOpenChange,
  leadName,
  closedValue,
  stages,
  currentStageId,
  onConfirm,
}: UndoSaleModalProps) {
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [clearValue, setClearValue] = useState(true);

  // Filter out "won" and "lost" stages
  const availableStages = stages.filter(stage => {
    const name = stage.name.toLowerCase();
    return !name.includes('fechado') && 
           !name.includes('ganho') && 
           !name.includes('won') &&
           !name.includes('perdido') &&
           !name.includes('lost') &&
           stage.id !== currentStageId;
  });

  const handleConfirm = () => {
    if (!selectedStageId) return;
    onConfirm(selectedStageId, clearValue);
    onOpenChange(false);
    setSelectedStageId('');
    setClearValue(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-amber-600" />
            Desfazer Venda
          </DialogTitle>
          <DialogDescription>
            Reverter a venda de <strong>{leadName}</strong> e mover para outro estágio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {closedValue && (
            <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Valor fechado atual:</span>
              <span className="font-medium text-green-600">
                R$ {closedValue.toLocaleString('pt-BR')}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Mover para qual estágio?</Label>
            <Select value={selectedStageId} onValueChange={setSelectedStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um estágio" />
              </SelectTrigger>
              <SelectContent>
                {availableStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: stage.color || '#888' }}
                      />
                      {stage.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {closedValue && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="clear-value"
                checked={clearValue}
                onCheckedChange={(checked) => setClearValue(checked === true)}
              />
              <Label htmlFor="clear-value" className="text-sm font-normal cursor-pointer">
                Limpar valor fechado (R$ {closedValue.toLocaleString('pt-BR')})
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedStageId}
            className="bg-amber-600 hover:bg-amber-700"
          >
            <Undo2 className="h-4 w-4 mr-1" />
            Desfazer Venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
