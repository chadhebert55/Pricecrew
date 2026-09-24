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
import {
  type CompanyProfile,
  type CompanyTrade,
  getGetCompanyProfileQueryKey,
  useGetCompanyProfile,
} from '@workspace/api-client-react';
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

import { E2eShell, Shell } from '@/components/layout/shell';
import { BrandLogo, ThemeToggle } from '@/components/brand';

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
const Billing = lazy(() =>
  import('@/pages/billing').then(({ Billing }) => ({ default: Billing })),
);
const Onboarding = lazy(() =>
  import('@/pages/onboarding').then(({ Onboarding }) => ({ default: Onboarding })),
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
const isE2eMode =
  import.meta.env.MODE === 'e2e' &&
  import.meta.env.VITE_E2E_AUTH === 'true';
// New: dedicated harness for the onboarding suite. Renders the real
// AuthenticatedPrivateRouter (fetches company profile, honors
// onboardingCompleted) instead of the bypass switch used by other E2E tests.
const isE2eOnboardingMode =
  isE2eMode && import.meta.env.VITE_E2E_ONBOARDING === 'true';
// Anonymous public-landing harness (5175): MODE=e2e with VITE_E2E_AUTH=false.
// Skips ClerkProvider so CI does not need a real Clerk publishable key (the
// placeholder key makes Clerk try to load clerk.browser.js from
// clerk.127.0.0.1, which never resolves, so the landing never renders).
const isE2eAnonymousMode =
  import.meta.env.MODE === 'e2e' &&
  import.meta.env.VITE_E2E_AUTH === 'false';
// The host helper ignores live fallback keys. Prefer the configured instance,
// including on preview hosts, and retain host inference for legacy Replit use.
const clerkPubKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ||
  publishableKeyFromHost(window.location.hostname);
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
  },
  variables: {
    colorPrimary: '#01696f',
    colorForeground: '#28251d',
    colorMutedForeground: '#6b6963',
    colorDanger: '#dc2626',
    colorBackground: '#f9f8f5',
    colorInput: '#f7f6f2',
    colorInputForeground: '#28251d',
    colorNeutral: '#d4d1ca',
    fontFamily: 'Satoshi, system-ui, sans-serif',
    borderRadius: '0.5rem',
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
    footerActionLink: 'text-[#01696f] font-semibold',
    footerActionText: 'text-slate-600',
    dividerText: 'text-slate-500',
    identityPreviewEditButton: 'text-[#01696f]',
    formFieldSuccessText: 'text-emerald-700',
    alertText: 'text-red-800',
    logoBox: 'h-12',
    logoImage: 'h-12 w-auto',
    socialButtonsBlockButton: 'border-slate-300 hover:bg-slate-50',
    formButtonPrimary: 'bg-[#01696f] hover:bg-[#0c4e54] text-white',
    formFieldInput: 'bg-slate-50 border-slate-300 text-slate-950',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-slate-200',
    alert: 'bg-red-50 border-red-200',
    otpCodeFieldInput: 'border-slate-300 text-slate-950',
    formFieldRow: 'text-slate-900',
    main: 'text-slate-950',
  },
};

function PrivateRouteSwitch({ trade }: { trade: CompanyTrade }) {
  const isElectrical = trade === 'Electrical';
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
            {/* `/` is the canonical dashboard URL; keep `/dashboard` for legacy links and bookmarks. */}
            <Route path="/dashboard" component={() => <Redirect to="/" />} />
            <Route path="/" component={Dashboard} />
            <Route path="/quotes" component={QuotesList} />
            <Route path="/quotes/new" component={() => <Builders trade={trade} choosingQuote />} />
            {isElectrical && <Route path="/quotes/new/ev-charger" component={NewQuote} />}
            {isElectrical && <Route path="/quotes/new/bathroom" component={NewBathroomQuote} />}
            {isElectrical && <Route path="/quotes/new/kitchen" component={NewKitchenQuote} />}
            {isElectrical && <Route path="/quotes/new/addition" component={NewAdditionQuote} />}
            {isElectrical && <Route path="/quotes/new/recessed-lighting" component={NewRecessedLightingQuote} />}
            {isElectrical && <Route path="/quotes/new/service-upgrade" component={NewServiceUpgradeQuote} />}
            {isElectrical && <Route path="/quotes/new/panel-replacement" component={NewPanelReplacementQuote} />}
            <Route path="/quotes/new/service-call" component={NewServiceCallQuote} />
            <Route path="/quotes/new/time-materials" component={NewTimeMaterialsQuote} />
            <Route path="/quotes/new/custom" component={NewCustomQuote} />
            {isElectrical && <Route path="/quotes/new/new-house" component={NewHouseQuote} />}
            <Route path="/quotes/:id" component={QuoteDetail} />
            <Route path="/builders" component={() => <Builders trade={trade} />} />
            <Route path="/price-book" component={PriceBook} />
            <Route path="/customers" component={Customers} />
            <Route path="/customers/:id" component={CustomerDetail} />
            <Route path="/billing" component={Billing} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function PrivateRouter() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const clerk = useClerk();

  if (!isLoaded) return <RouteLoading />;
  if (!isSignedIn || !userId) return <PrivateLanding />;

  return (
    <AuthenticatedPrivateRouter
      userId={userId}
      authMode="clerk"
      onSignOut={() => void clerk.signOut()}
    />
  );
}

/**
 * The onboarding gate. Extracted so the E2E harness can render it too, using
 * the same API-driven flow the production app uses. In E2E mode we render the
 * E2eShell instead of the Clerk-aware Shell and omit sign-out (E2E tests don't
 * exercise auth).
 */
function AuthenticatedPrivateRouter({
  userId,
  authMode,
  onSignOut,
}: {
  userId: string;
  authMode: 'clerk' | 'e2e';
  onSignOut?: () => void;
}) {
  const [, setLocation] = useLocation();
  const companyQueryKey = [...getGetCompanyProfileQueryKey(), userId] as const;
  const company = useGetCompanyProfile({
    query: { queryKey: companyQueryKey },
  });

  if (company.isLoading) return <RouteLoading />;
  if (company.isError || !company.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-destructive">
        PriceCrew could not load your company workspace. Refresh the page and try again.
      </div>
    );
  }

  const updateCompanyCache = (profile: CompanyProfile) => {
    queryClient.setQueryData(companyQueryKey, profile);
  };

  if (!company.data.onboardingCompleted) {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Onboarding
          initialCompanyName={company.data.companyName}
          // Do not pass company.data.trade: the auto-provisioner stores a
          // placeholder trade ("Other") on new companies, which would silently
          // pre-select a trade the user never chose and skip step 2 validation.
          onSignOut={onSignOut}
          onComplete={(profile) => {
            updateCompanyCache(profile);
            setLocation('/');
          }}
          onGoToPriceBook={(profile) => {
            updateCompanyCache(profile);
            setLocation('/price-book');
          }}
        />
      </Suspense>
    );
  }

  const shellChildren = <PrivateRouteSwitch trade={company.data.trade} />;
  return (
    <RoutedErrorBoundary>
      {authMode === 'clerk' ? <Shell>{shellChildren}</Shell> : <E2eShell>{shellChildren}</E2eShell>}
    </RoutedErrorBoundary>
  );
}

function PrivateLanding() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <BrandLogo />
        <ThemeToggle />
      </div>
      <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Private estimating for your service business.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          Build quotes, manage customers, and maintain company pricing in one
          protected workspace.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="rounded bg-primary px-5 py-3 font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded border border-border px-5 py-3 font-semibold"
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <BrandLogo />
      <ThemeToggle />
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <BrandLogo />
      <ThemeToggle />
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
            subtitle: 'Set up secure access to your workspace',
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


function E2eOnboardingProviderWithRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/proposals/:token" component={QuoteProposal} />
          <Route component={E2eOnboardingPrivateRouter} />
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function E2eOnboardingPrivateRouter() {
  // No onSignOut in E2E: Clerk isn't in the tree, and tests exercise onboarding
  // and the app shell, not the auth boundary.
  return <AuthenticatedPrivateRouter userId="e2e-user" authMode="e2e" />;
}

/**
 * Existing E2E harness (5174) that bypasses the onboarding gate. Kept for
 * backwards compatibility with dashboard-routes/quote-builder tests that
 * assume they land on the private app directly.
 */
function E2eBypassProviderWithRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/proposals/:token" component={QuoteProposal} />
          <Route>
            <E2eShell>
              <RoutedErrorBoundary>
                <PrivateRouteSwitch trade="Electrical" />
              </RoutedErrorBoundary>
            </E2eShell>
          </Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/**
 * Anonymous E2E harness (port 5175). Mirrors the signed-out Clerk experience
 * (public landing on every private path, public proposals still reachable)
 * without loading Clerk.
 */
function E2eAnonymousProviderWithRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/proposals/:token" component={QuoteProposal} />
          <Route component={PrivateLanding} />
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      {isE2eOnboardingMode ? (
        <E2eOnboardingProviderWithRoutes />
      ) : isE2eMode ? (
        <E2eBypassProviderWithRoutes />
      ) : isE2eAnonymousMode ? (
        <E2eAnonymousProviderWithRoutes />
      ) : (
        <ClerkProviderWithRoutes />
      )}
    </WouterRouter>
  );
}

export default App;
