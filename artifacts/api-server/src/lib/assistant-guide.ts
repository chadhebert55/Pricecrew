export type AssistantGuideSection = {
  title: string;
  path: string;
  content: string;
};

export const assistantGuide: AssistantGuideSection[] = [
  {
    title: "Dashboard",
    path: "/",
    content:
      "Dashboard summarizes saved company quotes, statuses, recent activity, total quoted value, and average margin. Start a quote from the New Quote action.",
  },
  {
    title: "Customers",
    path: "/customers",
    content:
      "Customers are company-scoped. Search by name or email, add a customer, open the customer to review quote history, and select an existing customer while building a quote.",
  },
  {
    title: "Quotes",
    path: "/quotes",
    content:
      "Quotes are immutable pricing snapshots once saved. Drafts can be reviewed, duplicated, revised, exported, and made customer-ready. Duplicate or revise an issued quote instead of changing its saved commercial terms.",
  },
  {
    title: "Builders",
    path: "/builders",
    content:
      "Builders turn scope inputs into assemblies and pricing using the company's current settings and Price Book. Electrical companies have specialized builders. Every trade has Service Call, Time & Materials, and Custom Items.",
  },
  {
    title: "Price Book",
    path: "/price-book",
    content:
      "Price Book contains the company's actual catalog costs and source metadata. Zero, unresolved, stale, conflicting, or duplicate exact prices stay visible and may block customer-ready output. The existing Northeast CSV importer remains available as a fallback.",
  },
  {
    title: "Takeoffs",
    path: "/builders",
    content:
      "Addition and New House builders can upload private plan PDFs. Extracted quantities must be reviewed and accepted before they become quote inputs. Low-confidence or failed OCR remains visible instead of being silently trusted.",
  },
  {
    title: "Proposals",
    path: "/quotes",
    content:
      "A ready quote can be shared as a customer proposal. Customer acceptance or decline is recorded against that exact saved revision and contractors receive a notification.",
  },
  {
    title: "Billing",
    path: "/billing",
    content:
      "Billing is currently test-mode subscription scaffolding and is separate from customers, quotes, estimating settings, and Price Book data.",
  },
  {
    title: "Settings",
    path: "/settings",
    content:
      "Settings control the company profile, trade, labor defaults, markups, target margin, tax, proposal details, and builder assumptions. Trade changes preserve existing private data.",
  },
  {
    title: "Onboarding",
    path: "/onboarding",
    content:
      "New accounts choose a trade and configure neutral company defaults. Electrical starter settings and catalog rows are initialized only when Electrical is selected.",
  },
  {
    title: "Assistant safety",
    path: "/",
    content:
      "PriceCrew Assistant reads only the signed-in user's company data. It never invents prices. Quote creation and Price Book imports are proposed as server-issued pending actions and require explicit confirmation before any write.",
  },
];

function terms(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1);
}

export function searchAssistantGuide(query: string, limit = 4) {
  const queryTerms = terms(query);
  const ranked = assistantGuide
    .map((section) => {
      const haystack = `${section.title} ${section.path} ${section.content}`.toLowerCase();
      const score = queryTerms.reduce(
        (total, term) => total + (haystack.includes(term) ? 1 : 0),
        0,
      );
      return { section, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ section }) => section);

  return ranked.length > 0 ? ranked : assistantGuide.filter((section) => section.title === "Assistant safety");
}