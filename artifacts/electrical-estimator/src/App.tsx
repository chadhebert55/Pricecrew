import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { Shell } from '@/components/layout/shell';

const Dashboard = lazy(() =>
  import('@/pages/dashboard').then(({ Dashboard }) => ({ default: Dashboard })),
);
const QuotesList = lazy(() =>
  import('@/pages/quotes/index').then(({ QuotesList }) => ({ default: QuotesList })),
);
const NewQuote = lazy(() =>
  import('@/pages/quotes/new').then(({ NewQuote }) => ({ default: NewQuote })),
);
const NewBathroomQuote = lazy(() =>
  import('@/pages/quotes/new-bathroom').then(({ NewBathroomQuote }) => ({ default: NewBathroomQuote })),
);
const NewKitchenQuote = lazy(() =>
  import('@/pages/quotes/new-kitchen').then(({ NewKitchenQuote }) => ({ default: NewKitchenQuote })),
);
const NewRecessedLightingQuote = lazy(() =>
  import('@/pages/quotes/new-recessed-lighting').then(({ NewRecessedLightingQuote }) => ({
    default: NewRecessedLightingQuote,
  })),
);
const NewServiceUpgradeQuote = lazy(() =>
  import('@/pages/quotes/new-service-upgrade').then(({ NewServiceUpgradeQuote }) => ({
    default: NewServiceUpgradeQuote,
  })),
);
const NewPanelReplacementQuote = lazy(() =>
  import('@/pages/quotes/new-panel-replacement').then(({ NewPanelReplacementQuote }) => ({
    default: NewPanelReplacementQuote,
  })),
);
const NewServiceCallQuote = lazy(() =>
  import('@/pages/quotes/new-service-call').then(({ NewServiceCallQuote }) => ({
    default: NewServiceCallQuote,
  })),
);
const NewTimeMaterialsQuote = lazy(() =>
  import('@/pages/quotes/new-time-materials').then(({ NewTimeMaterialsQuote }) => ({
    default: NewTimeMaterialsQuote,
  })),
);
const NewCustomQuote = lazy(() =>
  import('@/pages/quotes/new-custom').then(({ NewCustomQuote }) => ({ default: NewCustomQuote })),
);
const QuoteProposal = lazy(() =>
  import('@/pages/quotes/proposal').then(({ QuoteProposal }) => ({ default: QuoteProposal })),
);
const QuoteDetail = lazy(() =>
  import('@/pages/quotes/detail').then(({ QuoteDetail }) => ({ default: QuoteDetail })),
);
const Builders = lazy(() =>
  import('@/pages/builders').then(({ Builders }) => ({ default: Builders })),
);
const PriceBook = lazy(() =>
  import('@/pages/price-book').then(({ PriceBook }) => ({ default: PriceBook })),
);
const Customers = lazy(() =>
  import('@/pages/customers').then(({ Customers }) => ({ default: Customers })),
);
const CustomerDetail = lazy(() =>
  import('@/pages/customer-detail').then(({ CustomerDetail }) => ({ default: CustomerDetail })),
);
const Settings = lazy(() =>
  import('@/pages/settings').then(({ Settings }) => ({ default: Settings })),
);
const NotFound = lazy(() => import('@/pages/not-found'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  return (
    <RoutedErrorBoundary>
      <Shell>
        <Suspense fallback={<RouteLoading />}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/quotes" component={QuotesList} />
            <Route path="/quotes/new" component={NewQuote} />
            <Route path="/quotes/new/bathroom" component={NewBathroomQuote} />
            <Route path="/quotes/new/kitchen" component={NewKitchenQuote} />
            <Route path="/quotes/new/recessed-lighting" component={NewRecessedLightingQuote} />
            <Route path="/quotes/new/service-upgrade" component={NewServiceUpgradeQuote} />
            <Route path="/quotes/new/panel-replacement" component={NewPanelReplacementQuote} />
            <Route path="/quotes/new/service-call" component={NewServiceCallQuote} />
            <Route path="/quotes/new/time-materials" component={NewTimeMaterialsQuote} />
            <Route path="/quotes/new/custom" component={NewCustomQuote} />
            <Route path="/quotes/:id" component={QuoteDetail} />
            <Route path="/proposals/:token" component={QuoteProposal} />
            <Route path="/builders" component={Builders} />
            <Route path="/price-book" component={PriceBook} />
            <Route path="/customers" component={Customers} />
            <Route path="/customers/:id" component={CustomerDetail} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </Shell>
    </RoutedErrorBoundary>
  );
}

function RouteLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
