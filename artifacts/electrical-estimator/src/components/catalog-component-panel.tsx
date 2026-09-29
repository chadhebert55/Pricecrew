import { useState } from "react";
import {
  type PriceBookItem,
  type PriceBookImport,
  useUpdatePriceBookItem,
  usePreviewPriceBookImport,
  getListPriceBookItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  componentProof,
  evCatalogComponents,
  qualifiedComponentKinds,
  STACKED_CONTROL,
  STACKED_PLATE,
} from "@workspace/api-zod/catalog-components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const requests = [...evCatalogComponents, STACKED_CONTROL, STACKED_PLATE];
const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
export function CatalogComponentPanel({
  items,
  requestedMaterial,
  onReviewChange,
}: {
  items: PriceBookItem[];
  requestedMaterial: string;
  onReviewChange: (review: PriceBookImport) => void;
}) {
  const [request, setRequest] = useState(
    requestedMaterial || evCatalogComponents[0],
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [source, setSource] = useState("");
  const [opening, setOpening] = useState<"decorator" | "duplex" | "toggle">(
    "decorator",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const cache = useQueryClient();
  const update = useUpdatePriceBookItem({
    mutation: {
      onSuccess: () =>
        cache.invalidateQueries({ queryKey: getListPriceBookItemsQueryKey() }),
    },
  });
  const item = items.find((p) => p.id === Number(selected));
  const kind = qualifiedComponentKinds[request];
  const reset = () => {
    setConfirmed(false);
    setSource("");
    setSelected("");
    setMessage("");
  };
  const mapping = (key: string) =>
    items.filter(
      (p) =>
        (p.materialPreferences ?? []).some((m) => same(m.requestKey, key)) ||
        same(p.item, key),
    );
  const status = (key: string) => {
    const matches = mapping(key);
    if (!matches.length) return "Missing Catalog Item";
    if (matches.length > 1) return "Needs Review: multiple candidate mappings";
    const p = matches[0];
    if (qualifiedComponentKinds[key] && !componentProof(p, key))
      return "Needs Review: product qualification";
    if (p.isUnresolved || p.unitCost <= 0) return "Missing Price";
    if (p.supplierCost != null && p.normalizedUnitCost == null)
      return "Needs Review: supplier units";
    return "Verified / Priced";
  };
  const candidates = items.filter((p) =>
    [p.item, p.manufacturer, p.manufacturerPartNumber, p.supplierSku].some(
      (v) => v?.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const save = () => {
    if (!item) return;
    const proof = kind
      ? {
          kind: kind as
            | "NEMA 14-50R"
            | "NEMA 6-50R"
            | "Stacked single-pole/single-pole"
            | "Matching white wall plate",
          manufacturer: item.manufacturer!,
          manufacturerPartNumber: item.manufacturerPartNumber!,
          source,
          ...([STACKED_CONTROL, STACKED_PLATE].includes(request)
            ? { plateOpening: opening }
            : {}),
        }
      : undefined;
    update.mutate(
      {
        id: item.id,
        data: {
          materialPreferences: [
            ...(item.materialPreferences ?? []).filter(
              (p) => !same(p.requestKey, request),
            ),
            {
              requestKey: request,
              kind: "exact",
              ...(proof ? { verifiedComponent: proof } : {}),
            },
          ],
        },
      },
      {
        onSuccess: () => {
          setMessage(
            "Mapping saved. Recalculate the builder or refresh its materials; existing saved quotes are unchanged.",
          );
          setConfirmed(false);
        },
      },
    );
  };
  const selectClass =
    "min-h-11 w-full min-w-0 rounded-md border bg-background p-2 text-sm";
  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      aria-label="Builder material components"
    >
      <h2 className="text-lg font-semibold">Builder material components</h2>
      <p className="text-sm text-muted-foreground">
        Find required EV components even when no catalog row exists. Conditions
        in the estimate determine which components are needed. Addition
        stacked-control qualification uses this same workflow.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          EV Charger component checklist
        </summary>
        <div className="mt-3 space-y-2">
          {evCatalogComponents.map((key) => (
            <div
              key={key}
              className="flex flex-wrap justify-between gap-2 border-b pb-2 text-sm"
            >
              <button
                type="button"
                className="text-left underline"
                onClick={() => {
                  setRequest(key);
                  reset();
                }}
              >
                {key}
              </button>
              <span>{status(key)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs">
          Feeder/circuit breakers are selected by panel manufacturer, amperage,
          poles and protection in the builder. Use the exact unresolved breaker
          request to map a compatible product; a mapping never overrides breaker
          compatibility. Permit fees are quote-local, not catalog materials.
        </p>
      </details>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="component-request">Required component</Label>
          <select
            id="component-request"
            className={selectClass}
            value={request}
            onChange={(e) => {
              setRequest(e.target.value);
              reset();
            }}
          >
            {Array.from(
              new Set([
                ...requests,
                ...(requestedMaterial ? [requestedMaterial] : []),
              ]),
            ).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <p role="status" data-testid="component-status" className="text-sm">
            {status(request)}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="component-search">
            Search existing products, manufacturer, part or SKU
          </Label>
          <Input
            id="component-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            id="component-product"
            aria-label="Catalog product to map"
            className={selectClass}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setConfirmed(false);
              setMessage("");
            }}
          >
            <option value="">Select an existing product</option>
            {candidates.map((p) => (
              <option value={p.id} key={p.id}>
                {p.item} · {p.manufacturerPartNumber || "identity missing"} · $
                {p.unitCost}/{p.unit}
              </option>
            ))}
          </select>
        </div>
      </div>
      {kind && (
        <div className="space-y-3">
          <p className="text-sm">
            Required qualification: {kind}. Manufacturer and exact part number
            must already be present on the selected catalog record. A
            description or matching amp rating is not evidence.
          </p>
          <Label htmlFor="component-source">
            Qualification evidence (product sheet/reference)
          </Label>
          <Input
            id="component-source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setConfirmed(false);
            }}
            placeholder="Record the evidence you reviewed"
          />
          {[STACKED_CONTROL, STACKED_PLATE].includes(request) && (
            <div className="space-y-2">
              <Label htmlFor="component-opening">
                Verified single-yoke plate opening
              </Label>
              <select
                id="component-opening"
                className={selectClass}
                value={opening}
                onChange={(e) => {
                  setOpening(e.target.value as typeof opening);
                  setConfirmed(false);
                }}
              >
                <option value="decorator">Decorator / rectangular</option>
                <option value="duplex">Duplex</option>
                <option value="toggle">Toggle</option>
              </select>
              <p className="text-xs">
                The stacked switch and matching white plate must have the same
                verified opening. Qualify each component separately; no product
                is inferred.
              </p>
            </div>
          )}
        </div>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          id="component-confirm"
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I verified this exact product is suitable for the requested component,
        including configuration, ratings, units and installation requirements.
        This changes my company's future material selection, not saved quote
        snapshots.
      </label>
      <Button
        type="button"
        onClick={save}
        disabled={
          !item ||
          !confirmed ||
          update.isPending ||
          (!!kind &&
            (!source.trim() ||
              !item.manufacturer?.trim() ||
              !item.manufacturerPartNumber?.trim() ||
              !["ea", "each"].includes(item.unit)))
        }
      >
        Save component mapping
      </Button>
      {item && item.unitCost <= 0 && (
        <p className="text-sm">
          This product still needs a purchase cost. Mapping alone does not clear
          pricing review; enter its cost in the existing Price Book row or
          import a sourced price.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {update.isError && (
        <p role="alert">
          Could not save the mapping. Your estimate remains unresolved; retry.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Existing mappings:{" "}
        {mapping(request)
          .map((p) => `${p.item} (#${p.id})`)
          .join("; ") || "None"}
        . To switch products, remove an obsolete mapping in that product's
        Company material preference section. Competing preferences remain Needs
        Review; none is silently deleted.
      </p>
      <ManualCatalogReview onReviewChange={onReviewChange} />
    </section>
  );
}

function ManualCatalogReview({
  onReviewChange,
}: {
  onReviewChange: (review: PriceBookImport) => void;
}) {
  const [fields, setFields] = useState({
    item: "",
    manufacturer: "",
    manufacturerPartNumber: "",
    supplierSku: "",
    supplier: "",
    unitCost: "",
    sourceDate: "",
    category: "Devices",
    unit: "ea",
    amperage: "",
    poleCount: "",
    protectionType: "",
  });
  const preview = usePreviewPriceBookImport({
    mutation: { onSuccess: onReviewChange },
  });
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`;
  return (
    <details>
      <summary className="cursor-pointer font-medium">
        Add or update a product through catalog review
      </summary>
      <p className="my-3 text-sm">
        Enter the real product and sourced cost. This creates an import preview
        using the normal exact-identity matching workflow, not an immediate
        insertion. Review and apply the selected row in the import panel; then
        map it above. Supplier CSV upload remains available.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(fields).map(([key, value]) => (
          <div className="space-y-1" key={key}>
            <Label htmlFor={`catalog-new-${key}`}>
              {
                (
                  {
                    item: "Product description",
                    manufacturer: "Manufacturer",
                    manufacturerPartNumber: "Manufacturer part number",
                    supplierSku: "Supplier SKU (if provided)",
                    supplier: "Supplier / cost source",
                    unitCost: "Purchase cost",
                    sourceDate: "Price source date",
                    category: "Category",
                    unit: "Pricing unit",
                    amperage: "Amperage (required for breakers)",
                    poleCount: "Pole count (required for breakers)",
                    protectionType:
                      "Protection type (required for breakers: Standard, AFCI, GFCI, Dual Function)",
                  } as Record<string, string>
                )[key]
              }
            </Label>
            <Input
              id={`catalog-new-${key}`}
              type={
                key === "sourceDate"
                  ? "date"
                  : key === "unitCost"
                    ? "number"
                    : "text"
              }
              min={key === "unitCost" ? "0" : undefined}
              value={value}
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <Button
        className="mt-3"
        type="button"
        disabled={
          preview.isPending ||
          !fields.item.trim() ||
          !fields.manufacturer.trim() ||
          !fields.manufacturerPartNumber.trim() ||
          !fields.supplier.trim() ||
          !fields.sourceDate ||
          fields.unitCost === "" ||
          Number(fields.unitCost) < 0
        }
        onClick={() =>
          preview.mutate({
            data: {
              fileName: "manual-catalog-product.csv",
              sourceDate: fields.sourceDate,
              csv: [
                Object.keys(fields).map(esc).join(","),
                Object.values(fields).map(esc).join(","),
              ].join("\n"),
            },
          })
        }
      >
        Review product before applying
      </Button>
      {preview.isSuccess && (
        <p role="status" className="text-sm">
          Product review is ready in the import panel above. No catalog change
          has been applied yet.
        </p>
      )}
      {preview.isError && (
        <p role="alert">
          Could not preview this product. Check the entered fields and retry.
        </p>
      )}
    </details>
  );
}
