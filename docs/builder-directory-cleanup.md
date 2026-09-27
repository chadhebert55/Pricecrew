# Quote Builders directory cleanup

## Scope and files

Navigation and presentation only. No builder form, calculation, catalog, pricing, quote snapshot, proposal, billing, subscription price, database schema, or draft-storage implementation changed.

- `artifacts/electrical-estimator/src/pages/builders.tsx`: compact grouped cards, search, favorite controls, shortcut, quick links.
- `artifacts/electrical-estimator/src/lib/builder-directory.ts`: presentation metadata with stable IDs/routes, electrical trade, categories, display names, descriptions, icons and keywords.
- `artifacts/electrical-estimator/src/hooks/use-builder-preferences.ts`: per-user browser preferences and route-based recent tracking.
- `artifacts/electrical-estimator/src/App.tsx`: mount recent-route observer inside the existing private router; route definitions remain unchanged.
- `scripts/src/builder-directory.browser.test.ts`: navigation, preferences, search, keyboard, storage failure, responsive and draft-recovery tests.

## Display names and organization

| Category | Builders |
| --- | --- |
| Residential Projects | New House, Addition, Kitchen, Bathroom, Recessed Lighting |
| Service & Equipment | Service Call, Panel Replacement, Service Upgrade, EV Charger |
| Flexible Estimating | Time & Materials, Custom Quote |

Display-only renames: Residential Addition → Addition; Kitchen Electrical → Kitchen; Bathroom Electrical → Bathroom; EV Charger Installation → EV Charger; Custom Items → Custom Quote. Existing saved builder identifiers remain unchanged.

## Search and personalization

Client-side case-insensitive search matches all entered words across names, descriptions, categories and useful keywords. `car` finds EV Charger, `panel` finds Panel Replacement and Service Upgrade. Clear/reset actions restore all cards; empty searches show an explicit no-results message. Search also filters the compact favorite/recent sections.

Favorites use a separate button beside the main link, never a nested interactive element. The section is hidden when empty. Recent usage records the last three unique builder routes, including direct bookmarks, favorites and search results. Reopening a builder moves it to the front.

Production persistence uses localStorage key `pricecrew:builder-directory:v1:<encoded Clerk user ID>`. No customer, quote or financial information is stored in these preferences, only builder IDs. Unknown IDs, duplicates and malformed records are handled safely. Sign-in scope changes do not reuse another user's preference key. Cross-tab storage events refresh the display. If writes are blocked, an in-memory fallback preserves the current session and displays a short notice. Preferences are browser-local, not synchronized between devices. No database migration was added.

The E2E harness uses the existing test draft-scope mechanism to exercise user isolation; this does not change production authentication.

## Accessibility and responsive behavior

Native links cover the cards and support Enter, opening in a new tab, pointer hover and visible keyboard focus. Favorite buttons have explicit add/remove labels and `aria-pressed`. Search has a proper label and announces result counts. `/` focuses search only outside editable controls and without modifier keys.

Cards retain the existing dark surfaces, cyan accent and icon family. ACTIVE badges and large Use Builder buttons are removed. Cards use 16px padding, concise 14px descriptions, 16px titles and a 176px minimum height. Normal layout is one column on mobile, two on tablet and three on desktop, including wide desktops. Favorites/search controls retain at least 44px targets.

The existing `/quotes/new` chooser retains its New Quote heading and explanatory text. Non-electrical company fallback behavior remains unchanged; this is not a subscription restriction.

## Verification

Final local checks: 34/34 browser tests, 293/293 API tests, 13/13 deployment-configuration tests, TypeScript checks and production build passed.

- Opened all 11 cards and checked the existing URL and actual builder heading.
- Favorited Kitchen without navigation, reloaded and confirmed persistence; removed it and confirmed the empty section disappears.
- Opened Bathroom, returned, reopened through Recently Used and restored an unfinished Bathroom draft.
- Opened a favorite link and checked the actual Kitchen builder.
- Verified direct bookmarked builder visits update recent history and the list stays unique and capped at three.
- Tested panel, service, car, bath and custom queries, empty results and reset.
- Tested keyboard activation, `/` behavior, no nested buttons inside links, scope isolation, corrupt preferences and unavailable-storage fallback.
- Captured desktop 1280px, tablet 768px and mobile 375px screenshots; checked no horizontal overflow and responsive columns.
- Three Solo/Crew/Pro-labelled billing fixtures show all 11 links and demonstrate that the directory makes no billing request at all. These are not live paid-account tests.

All electrical builders are available without any plan check in the directory and existing routes. No locks, per-builder upgrades or entitlements were added.

## Subscription limitation found, intentionally unchanged

The current backend billing implementation exposes Solo and Crew test checkout and returns `currentPlan: null`; it does not yet expose a Pro subscription or persisted paid-plan account state. Accordingly, a genuine three-live-paid-account test cannot be claimed. This cleanup preserves billing exactly as requested. Pro billing setup is a separate task, not a reason to gate builders.

## Remaining limitations

Preferences are local to each signed-in user's browser, with session-only fallback if storage is unavailable. Card density was reduced, but no unsupported exact whole-page percentage reduction is claimed: category headings and optional favorite/recent rows affect overall height.
