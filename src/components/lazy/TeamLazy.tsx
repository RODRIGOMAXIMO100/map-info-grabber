import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Lazy loaded team components (charts)
export const LazyPerformanceChart = lazy(() => import('@/components/team/PerformanceChart'));
export const LazyActivityHeatmapChart = lazy(() => import('@/components/team/ActivityHeatmapChart'));

// Chart skeleton fallback
const ChartSkeleton = ({ height = 300 }: { height?: number }) => (
  <Card>
    <CardHeader>
      <Skeleton className="h-5 w-40" />
    </CardHeader>
    <CardContent>
      <Skeleton className="w-full" style={{ height }} />
    </CardContent>
  </Card>
);

// Wrapped components with Suspense
export const PerformanceChart = (props: React.ComponentProps<typeof LazyPerformanceChart>) => (
  <Suspense fallback={<ChartSkeleton height={350} />}>
    <LazyPerformanceChart {...props} />
  </Suspense>
);

export const ActivityHeatmapChart = (props: React.ComponentProps<typeof LazyActivityHeatmapChart>) => (
  <Suspense fallback={<ChartSkeleton height={200} />}>
    <LazyActivityHeatmapChart {...props} />
  </Suspense>
);
