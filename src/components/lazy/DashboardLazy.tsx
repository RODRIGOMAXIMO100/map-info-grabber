import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Lazy loaded dashboard components
export const LazyInstanceMonitor = lazy(() => import('@/components/InstanceMonitor'));
export const LazyFunnelEvolutionChart = lazy(() => import('@/components/dashboard/FunnelEvolutionChart'));
export const LazyActivityHeatmap = lazy(() => import('@/components/dashboard/ActivityHeatmap'));
export const LazyFunnelMovementFeed = lazy(() => import('@/components/dashboard/FunnelMovementFeed'));
export const LazySalesFunnelMetrics = lazy(() => import('@/components/dashboard/SalesFunnelMetrics'));

// Chart skeleton fallback
const ChartSkeleton = ({ height = 300 }: { height?: number }) => (
  <Card>
    <CardHeader>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-60" />
    </CardHeader>
    <CardContent>
      <Skeleton className="w-full" style={{ height }} />
    </CardContent>
  </Card>
);

// Instance monitor skeleton
const InstanceMonitorSkeleton = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-5 w-48" />
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </CardContent>
  </Card>
);

// Wrapped components with Suspense
export const InstanceMonitor = (props: React.ComponentProps<typeof LazyInstanceMonitor>) => (
  <Suspense fallback={<InstanceMonitorSkeleton />}>
    <LazyInstanceMonitor {...props} />
  </Suspense>
);

export const FunnelEvolutionChart = (props: React.ComponentProps<typeof LazyFunnelEvolutionChart>) => (
  <Suspense fallback={<ChartSkeleton height={350} />}>
    <LazyFunnelEvolutionChart {...props} />
  </Suspense>
);

export const ActivityHeatmap = (props: React.ComponentProps<typeof LazyActivityHeatmap>) => (
  <Suspense fallback={<ChartSkeleton height={200} />}>
    <LazyActivityHeatmap {...props} />
  </Suspense>
);

export const FunnelMovementFeed = (props: React.ComponentProps<typeof LazyFunnelMovementFeed>) => (
  <Suspense fallback={<ChartSkeleton height={400} />}>
    <LazyFunnelMovementFeed {...props} />
  </Suspense>
);

export const SalesFunnelMetrics = (props: React.ComponentProps<typeof LazySalesFunnelMetrics>) => (
  <Suspense fallback={<ChartSkeleton height={300} />}>
    <LazySalesFunnelMetrics {...props} />
  </Suspense>
);
