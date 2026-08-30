import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import {
  ClerkProvider,
  SignIn,
  SignUp,
  useAuth,
  useClerk,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Route,
  Redirect,
  Switch,
  Link,
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

const NewAdditionQuote = lazy(() =>
  import('@/pages/quotes/new-addition').then(({ NewAdditionQuote }) => ({ default: NewAdditionQuote })),
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
const NewHouseQuote = lazy(() =>
  import('@/pages/quotes/new-house').then(({ NewHouseQuote }) => ({ default: NewHouseQuote })),
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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#f97316',
    colorForeground: '#0f172a',
    colorMutedForeground: '#64748b',
    colorDanger: '#dc2626',
    colorBackground: '#ffffff',
    colorInput: '#f8fafc',
    colorInputForeground: '#0f172a',
    colorNeutral: '#cbd5e1',
    fontFamily: 'Chivo, system-ui, sans-serif',
    borderRadius: '0.25rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-lg w-[440px] max-w-full overflow-hidden border border-slate-200',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-slate-950',
    headerSubtitle: 'text-slate-600',
    socialButtonsBlockButtonText: 'text-slate-900',
    formFieldLabel: 'text-slate-800',
    footerActionLink: 'text-orange-600 font-semibold',
    footerActionText: 'text-slate-600',
    dividerText: 'text-slate-500',
    identityPreviewEditButton: 'text-orange-600',
    formFieldSuccessText: 'text-emerald-700',
    alertText: 'text-red-800',
    logoBox: 'h-12',
    logoImage: 'h-12 w-auto',
    socialButtonsBlockButton: 'border-slate-300 hover:bg-slate-50',
    formButtonPrimary: 'bg-orange-600 hover:bg-orange-700 text-white',
    formFieldInput: 'bg-slate-50 border-slate-300 text-slate-950',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-slate-200',
    alert: 'bg-red-50 border-red-200',
    otpCodeFieldInput: 'border-slate-300 text-slate-950',
    formFieldRow: 'text-slate-900',
    main: 'text-slate-950',
  },
};

function PrivateRouter() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <RouteLoading />;
  if (!isSignedIn) return <PrivateLanding />;

  return (
    <RoutedErrorBoundary>
      <Shell>
        <Suspense fallback={<RouteLoading />}>
          <Switch>
            {/* `/` is the canonical dashboard URL; keep `/dashboard` for legacy links and bookmarks. */}
            <Route path="/dashboard" component={() => <Redirect to="/" />} />
            <Route path="/" component={Dashboard} />
            <Route path="/quotes" component={QuotesList} />
            <Route path="/quotes/new" component={NewQuote} />
            <Route path="/quotes/new/bathroom" component={NewBathroomQuote} />
            <Route path="/quotes/new/kitchen" component={NewKitchenQuote} />
            <Route path="/quotes/new/addition" component={NewAdditionQuote} />
            <Route path="/quotes/new/recessed-lighting" component={NewRecessedLightingQuote} />
            <Route path="/quotes/new/service-upgrade" component={NewServiceUpgradeQuote} />
            <Route path="/quotes/new/panel-replacement" component={NewPanelReplacementQuote} />
            <Route path="/quotes/new/service-call" component={NewServiceCallQuote} />
            <Route path="/quotes/new/time-materials" component={NewTimeMaterialsQuote} />
            <Route path="/quotes/new/custom" component={NewCustomQuote} />
            <Route path="/quotes/new/new-house" component={NewHouseQuote} />
            <Route path="/quotes/:id" component={QuoteDetail} />
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

function PrivateLanding() {
  return (
    <main className="min-h-screen bg-secondary px-6 py-16 text-secondary-foreground">
      <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center">
        <div className="mb-8 flex items-center gap-3">
          <img src={`${basePath}/logo.svg`} alt="" className="h-12 w-12" />
          <span className="font-mono text-sm uppercase tracking-[0.24em] text-primary">
            Electrical Estimator
          </span>
        </div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Private estimating for your contracting company.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-secondary-foreground/70">
          Build quotes, manage customers, and maintain company pricing in one
          protected workspace.
        </p>
        <div className="mt-10 flex gap-3">
          <Link
            href="/sign-in"
            className="rounded bg-primary px-5 py-3 font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded border border-secondary-foreground/25 px-5 py-3 font-semibold"
          >
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/proposals/:token" component={QuoteProposal} />
      <Route component={PrivateRouter} />
    </Switch>
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

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(
    () =>
      addListener(({ user }) => {
        const userId = user?.id ?? null;
        if (
          previousUserId.current !== undefined &&
          previousUserId.current !== userId
        ) {
          queryClient.clear();
        }
        previousUserId.current = userId;
      }),
    [addListener],
  );

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to your estimating workspace',
          },
        },
        signUp: {
          start: {
            title: 'Create your account',
            subtitle: 'Set up secure access to the estimator',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
