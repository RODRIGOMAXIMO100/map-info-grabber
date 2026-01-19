import { lazy, Suspense } from 'react';

// Lazy loaded modal/sheet components
export const LazyLeadDetailsSheet = lazy(() => 
  import('@/components/LeadDetailsSheet').then(m => ({ default: m.LeadDetailsSheet }))
);
export const LazyTransferInstanceModal = lazy(() => 
  import('@/components/whatsapp/TransferInstanceModal').then(m => ({ default: m.TransferInstanceModal }))
);
export const LazyTransferUserModal = lazy(() => 
  import('@/components/whatsapp/TransferUserModal').then(m => ({ default: m.TransferUserModal }))
);
export const LazyReminderModal = lazy(() => 
  import('@/components/crm/ReminderModal').then(m => ({ default: m.ReminderModal }))
);
export const LazyVendorDetailSheet = lazy(() => import('@/components/team/VendorDetailSheet'));
export const LazyClosedValueModal = lazy(() => 
  import('@/components/crm/ClosedValueModal').then(m => ({ default: m.ClosedValueModal }))
);
export const LazyAddLeadModal = lazy(() => 
  import('@/components/crm/AddLeadModal').then(m => ({ default: m.AddLeadModal }))
);

// Modal components don't need visual fallbacks since they're only shown when open
// The null fallback is appropriate - the modal will appear when loaded

type LeadDetailsSheetProps = React.ComponentProps<typeof LazyLeadDetailsSheet>;
type TransferInstanceModalProps = React.ComponentProps<typeof LazyTransferInstanceModal>;
type TransferUserModalProps = React.ComponentProps<typeof LazyTransferUserModal>;
type ReminderModalProps = React.ComponentProps<typeof LazyReminderModal>;
type VendorDetailSheetProps = React.ComponentProps<typeof LazyVendorDetailSheet>;
type ClosedValueModalProps = React.ComponentProps<typeof LazyClosedValueModal>;
type AddLeadModalProps = React.ComponentProps<typeof LazyAddLeadModal>;

// Wrapped components - only render Suspense when modal is open
export const LeadDetailsSheet = ({ open, ...props }: LeadDetailsSheetProps) => {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LazyLeadDetailsSheet open={open} {...props} />
    </Suspense>
  );
};

export const TransferInstanceModal = ({ open, ...props }: TransferInstanceModalProps) => {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LazyTransferInstanceModal open={open} {...props} />
    </Suspense>
  );
};

export const TransferUserModal = ({ open, ...props }: TransferUserModalProps) => {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LazyTransferUserModal open={open} {...props} />
    </Suspense>
  );
};

export const ReminderModal = ({ open, ...props }: ReminderModalProps) => {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LazyReminderModal open={open} {...props} />
    </Suspense>
  );
};

export const VendorDetailSheet = ({ open, ...props }: VendorDetailSheetProps) => {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LazyVendorDetailSheet open={open} {...props} />
    </Suspense>
  );
};

export const ClosedValueModal = ({ open, ...props }: ClosedValueModalProps) => {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LazyClosedValueModal open={open} {...props} />
    </Suspense>
  );
};

export const AddLeadModal = ({ open, ...props }: AddLeadModalProps) => {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LazyAddLeadModal open={open} {...props} />
    </Suspense>
  );
};
