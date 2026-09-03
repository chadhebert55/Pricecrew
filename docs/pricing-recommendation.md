# PriceCrew Pricing Recommendation
*Prepared September 2, 2026*

---

## TL;DR

**Three tiers: Solo $49/mo, Crew $99/mo, Pro $199/mo. Annual pricing saves 20%. 14-day free trial, no card required. Month-to-month, no contracts, no setup fees.**

The unfair advantage: **ships with real electrical pricing pre-loaded** at three tiers (retail, contractor, premium contractor) so a new user can quote a real job in five minutes without configuring anything.

---

## The tiers

| | **Solo** | **Crew** | **Pro** |
|---|---|---|---|
| **Monthly** | $49/mo | $99/mo | $199/mo |
| **Annual** | $39/mo ($468/yr) | $79/mo ($948/yr) | $159/mo ($1,908/yr) |
| **Users** | 1 | Up to 5 | Up to 15 |
| **Best for** | Solo electrician | 2–5 tech shop | Growing shop, multi-crew |

### Solo — $49/mo

The wedge. Everything a solo electrician needs to quote real jobs.

- Full electrical estimating with pre-loaded price books (retail, contractor, premium)
- **Upload your own supply-house prices** (CSV import)
- Custom margin/markup rules
- AI quote descriptions (fills scope of work in plain English)
- AI material list from job description
- **50 AI actions per month included**
- Unlimited quotes & proposals
- Basic invoicing
- Mobile app
- Client management
- Email support

### Crew — $99/mo

The sweet spot. This is where the "wow" AI lives.

- Everything in Solo, up to 5 users
- **Shared team price book** (everyone sees the same custom prices)
- Price book version history
- **Photo-to-takeoff** — snap a panel, get a material list
- **Plan markup takeoff** — upload a PDF blueprint, AI counts fixtures/outlets/circuits
- AI proposal writer (turn a quote into a client-ready proposal)
- **Unlimited AI actions** (fair-use cap ~1,000/mo)
- Scheduling & dispatch
- Payments (via Stripe)
- QuickBooks sync
- Photo attachments on jobs
- Job costing / profit tracking
- Chat support

### Pro — $199/mo

For growing shops that need the sophisticated stuff.

- Everything in Crew, up to 15 users
- **Multi-price-book support** — separate residential/commercial pricing, or per-crew books
- **Bulk price updates** via API
- **AI job assistant on mobile** (voice: "quote a 100A subpanel for a garage")
- **AI pricing recommendations** ("this job is 20% below your average margin, here's why")
- **Historical learning** — AI learns from your last 100 jobs and improves quotes for your specific business
- Priority support
- Advanced reporting
- API access
- Additional users at $25/mo each

---

## Pre-loaded price books (ships with every tier)

None of these use supply-house names — the pricing is nationally portable. At signup, users pick their default book:

| Book | What it represents | Who it's for |
|---|---|---|
| **Retail pricing** | Home Depot / Lowe's / Menards averages | Solo electricians without a supply-house account |
| **Contractor pricing** *(default)* | Typical wholesale rates a licensed electrician gets at any supply house (~15–30% below retail) | Most licensed contractors |
| **Premium contractor pricing** | Volume/loyalty rates for shops doing $500k+/yr with one supply house (~25–40% below retail) | Established multi-tech shops |
| **Custom** | User uploads their own pricing | Any tier, any user |

Users can also **blend books** — buy wire at contractor pricing, buy fixtures at retail — but that's a Pro-tier feature.

### Data source & maintenance

- Contractor Price Book v1 is seeded from the audited price data already in the repo (13,966 SKUs across firestop, wire, boxes, breakers, fixtures, etc.)
- Framed as "contractor pricing" — nationally portable because supply-house margins are consistent across regions
- Refresh quarterly (manual for now, crowd-sourced from user uploads once you hit 200+ users)
- Never claim specific supply-house rates in marketing — call it "contractor pricing" or "typical wholesale pricing"

---

## Why these numbers

**$49 solo** undercuts Housecall Pro Basic ($59) and does *real electrical estimating* that HCP doesn't. Jobber Core is $29 but bare-bones — you're clearly a step up.

**$99 crew** is the sharp weapon. Housecall Pro Essentials is $149, Jobber's 5-user plans start at $199–$299. You're 33–50% cheaper for the exact buyer profile.

**$199 pro** stays under Housecall Pro MAX ($299) and Jobber Grow ($399+). No sane 5-tech electrical shop is paying $14k+/year for ServiceTitan, so you don't need to compete there yet.

## What NOT to do

- ❌ **No per-user pricing** — confuses buyers, punishes growth. Include seats.
- ❌ **No hidden implementation fee** — that's ServiceTitan's tax. Yours is $0. Say it loud.
- ❌ **No 12-month contracts** — month-to-month is a marketing weapon against ServiceTitan.
- ❌ **No freemium** — free plans attract kickers, not payers. 14-day trial only.
- ❌ **No card required for trial** — reduces friction. Your buyer hates giving cards to random websites.
- ❌ **No supply-house names in marketing** — legally risky, and it excludes anyone outside that region.

---

## Launch pricing move

**Founding member pricing:** first 100 customers lock in **50% off for life** — $24.50 Solo, $49.50 Crew.

- Creates urgency
- Builds a loyal base of testimonials
- Their word-of-mouth in supply houses and IBEW halls is worth more than the discount

Expire the founding tier at **100 customers OR December 31, 2026** — whichever comes first.

## AI cost math (for your reference)

Anthropic API calls cost real money. At Claude Sonnet 4.5 pricing, a typical takeoff runs $0.05–$0.30 per job.

| Tier | Cap | Typical usage | Your API cost |
|---|---|---|---|
| Solo | 50 actions/mo | ~30 actions | $1.50–$9/mo |
| Crew | 1,000/mo fair-use | ~200 actions | $10–$60/mo |
| Pro | Effectively unlimited | ~500 actions | $25–$150/mo |

Even at the top end, Pro's $199 price covers API costs 1.3–8x over. Healthy margin.

## Add-ons for later (don't ship in v1)

- **Payments** — take 0.5% on top of Stripe processing (Jobber and HCP both do this)
- **Extra assembly libraries** — pre-built material lists for niche jobs (EV chargers, solar tie-ins, gen sets)
- **Automated supply-house sync** — for the handful of chains with public price APIs (later)
- **Team seats beyond Pro** — $25/mo per additional user (already listed above)

---

## What to test before committing

The pricing above is my best guess. Before you commit, sanity-check with 5–10 electricians in your Facebook groups or at the supply-house counter:

1. "Would you pay $49/mo for a tool that gives you real supply pricing and quotes in 5 minutes?"
2. "What are you paying now for estimating?" (probably $0 = spreadsheets, or ~$150 = Jobber/HCP)
3. "What's the price where you'd say 'no way'?"

Their answers will either confirm the tiers or push you 20% either direction. Cheap research, huge signal.
