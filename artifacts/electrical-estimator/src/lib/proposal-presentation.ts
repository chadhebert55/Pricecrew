import type { CustomerProposal } from "@workspace/api-client-react";

// Neutral starter language, editable in company settings. No invented deposit,
// payment deadline, permit inclusion, warranty, or jurisdiction-specific claim.
export const DEFAULT_PROPOSAL_TERMS = [
  "Validity: Pricing and availability are subject to reconfirmation before scheduling.",
  "Payment: The payment schedule and any deposit will be agreed in writing before work begins.",
  "Concealed conditions: Unforeseen conditions affecting the scope, price, or schedule will be discussed with the customer before additional work proceeds.",
  "Changes: Work outside this scope requires customer approval of the additional price and any schedule changes.",
  "Permits: Permit and inspection responsibilities and fees will be confirmed before work begins. They are included only when expressly listed in this proposal.",
  "Scheduling: Work dates will be confirmed with the customer, subject to material availability, site access, and required approvals.",
].join("\n");

export const proposalDate = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "long", day: "numeric", year: "numeric",
}).format(new Date(value));
export const proposalTerms = (quote: CustomerProposal) => quote.terms.trim() || DEFAULT_PROPOSAL_TERMS;
export const proposalScopeValue = (line: CustomerProposal["scope"][number]) =>
  line.displayValue ?? `${line.quantity} ${line.unit}`;
export const proposalMoney = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
export const proposalAccent = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : "#2563eb";
