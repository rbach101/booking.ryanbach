import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const Dashboard = lazy(() => import('./Dashboard'));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-sage" />
    </div>
  );
}

const Index = () => (
  <Suspense fallback={<PageLoader />}>
    <Dashboard />
  </Suspense>
);

export default Index;
