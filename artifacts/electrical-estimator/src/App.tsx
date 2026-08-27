import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { Shell } from '@/components/layout/shell';
import { Dashboard } from '@/pages/dashboard';
import { QuotesList } from '@/pages/quotes/index';
import { NewQuote } from '@/pages/quotes/new';
import { NewBathroomQuote } from '@/pages/quotes/new-bathroom';
import { NewKitchenQuote } from '@/pages/quotes/new-kitchen';
import { NewRecessedLightingQuote } from '@/pages/quotes/new-recessed-lighting';
import { NewServiceUpgradeQuote } from '@/pages/quotes/new-service-upgrade';
import { NewPanelReplacementQuote } from '@/pages/quotes/new-panel-replacement';
import { NewServiceCallQuote } from '@/pages/quotes/new-service-call';
import { NewTimeMaterialsQuote } from '@/pages/quotes/new-time-materials';
import { NewCustomQuote } from '@/pages/quotes/new-custom';
import { QuoteProposal } from '@/pages/quotes/proposal';
import { QuoteDetail } from '@/pages/quotes/detail';
import { Builders } from '@/pages/builders';
import { PriceBook } from '@/pages/price-book';
import { Customers } from '@/pages/customers';
import { CustomerDetail } from '@/pages/customer-detail';
import { Settings } from '@/pages/settings';

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
      </Shell>
    </RoutedErrorBoundary>
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
