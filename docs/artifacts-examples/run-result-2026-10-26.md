# Run result report

## Summary

| Status | Cases |
| --- | --- |
| passed | 12 |
| failed | 2 |
| blocked | 0 |
| skipped | 0 |
| uncertain | 0 |
| partial | 0 |

## Cases

One row per case: its latest result.

| Case | Type | Status | Finished | Evidence | Result |
| --- | --- | --- | --- | --- | --- |
| a11y-catalog-and-product-pages-clean | a11y | failed | 2026-10-26T12:46:58.042Z | 4 | run-result-b95cbbfa-5854-4bd1-84aa-2e6b598557bc |
| api-invalid-registration-returns-4xx | api | passed | 2026-10-26T12:44:34.124Z | 2 | run-result-948ac3f9-6b36-4326-baed-10335ccfa801 |
| api-products-list-returns-200 | api | passed | 2026-10-22T19:39:11.129Z | 2 | run-result-f6e1da73-c5c3-4a09-a588-c56324bc8e74 |
| api-protected-endpoint-without-token-denied | api | passed | 2026-10-26T12:44:34.071Z | 2 | run-result-2909315d-01b4-494a-8c62-3e07650b4ee6 |
| cart-add-change-remove-total | e2e | passed | 2026-10-22T19:59:35.557Z | 15 | run-result-00084455-1b62-49f3-af06-f4fa71dbb099 |
| catalog-list-shows-products | e2e | passed | 2026-10-22T20:19:33.654Z | 8 | run-result-9d49f8a5-439d-4c1a-8c07-da1d08ff9901 |
| filter-by-category-narrows-list | e2e | passed | 2026-10-22T19:52:57.868Z | 6 | run-result-fbffb1d4-37f3-4317-8aa9-8f785af5e66f |
| filter-no-match-empty-state | e2e | passed | 2026-10-22T19:53:53.954Z | 7 | run-result-6d565287-54c9-4f40-9b70-fab20883f281 |
| login-invalid-credentials-rejected | e2e | passed | 2026-10-22T19:56:17.293Z | 8 | run-result-3501d30e-3329-45dc-bb4d-946464658a6d |
| product-details-show-core-data | e2e | failed | 2026-10-26T12:41:43.712Z | 6 | run-result-60927377-8960-4cc4-ad31-925c77ba9f2f |
| registration-required-fields-validated | e2e | passed | 2026-10-22T19:56:42.478Z | 7 | run-result-498c146a-29cd-4a88-9081-150f31febc96 |
| search-empty-query-keeps-page-working | e2e | passed | 2026-10-22T19:54:27.886Z | 7 | run-result-b7486ddc-6fbd-422d-8f5b-fc85606fdd22 |
| search-returns-matching-products | e2e | passed | 2026-10-22T19:39:46.473Z | 7 | run-result-7b2c6144-3e3e-4b0a-b959-135b09e906c8 |
| sort-by-price-orders-list | e2e | passed | 2026-10-22T19:53:25.536Z | 6 | run-result-bbff7a7f-806d-40ad-b569-941699a7dc16 |

## Failure reasons

- a11y-catalog-and-product-pages-clean (failed): axe-core 4.13.0 (WCAG 2.1 AA) found violations on both pages. Home page: 2 rules, serious — label-content-name-mismatch on the language button #language (aria-label 'Select language' does not contain …
- product-details-show-core-data (failed): Product page for the first product (Combination Pliers, $14.15) shows name, price and description matching the list card, but no stock availability indicator is shown: a text check for 'In stock' / 'O…

## Spec runs

Executions of generated specs with `qa run`.

| Run | Type | Started | Finished | Specs | Results by status |
| --- | --- | --- | --- | --- | --- |
| run-8225767d-09f9-42be-9a4d-bd66aea7fc97 | e2e | 2026-10-25T12:27:49.530Z | 2026-10-25T12:28:41.979Z | 9 | passed 3, failed 6, blocked 0, skipped 0, uncertain 0, partial 0 |
| run-5dc378a0-0622-4cb8-bf97-f2049714d348 | e2e | 2026-10-25T12:29:23.645Z | 2026-10-25T12:29:46.961Z | 3 | passed 3, failed 0, blocked 0, skipped 0, uncertain 0, partial 0 |
| run-cf23e55f-79ee-4821-8b6f-c4f8a35f7733 | e2e | 2026-10-25T12:30:01.272Z | 2026-10-25T12:30:24.348Z | 3 | passed 3, failed 0, blocked 0, skipped 0, uncertain 0, partial 0 |
| run-d652c9ff-a74a-43c9-976b-b50be7986ec3 | e2e | 2026-10-26T13:38:25.044Z | 2026-10-26T13:38:30.598Z | 3 | passed 3, failed 0, blocked 0, skipped 0, uncertain 0, partial 0 |

## Accessibility

WCAG 2.1 level AA, 4 scan(s). Automated results alone do not establish conformance.

| Status | Criteria |
| --- | --- |
| passed | 1 |
| failed | 2 |
| needs-manual-check | 47 |
| not-applicable | 0 |
| excepted | 0 |

## Defects

| Defect | Title | Severity (proposed) | Category | Status |
| --- | --- | --- | --- | --- |
| a11y-catalog-product-wcag-violations | Catalog filter list markup and language button label fail WCAG 2.1 AA | major | accessibility | draft |
| a11y-language-button-and-list-markup | Home and product pages have WCAG 2.1 AA violations (language button name, invalid list markup) | major | accessibility | accepted |
| product-page-missing-stock-availability | Product page does not show stock availability ("In stock") for in-stock products | minor | functional | accepted |

## Root cause analysis

### a11y-language-button-and-list-markup

**Facts**

- axe-core 4.13.0 (WCAG 2.1 AA) reports label-content-name-mismatch (serious, WCAG 2.5.3) on the language button #language on both the home page and the product page; the button has aria-label="Select language" and its visible text is not part of that name.
- axe-core reports the list rule (serious, WCAG 1.3.1) on three category <ul> elements on the home page; each directly contains a <fieldset> child, which is not an allowed child of <ul>.
- The language button sits in the site-wide navigation (same element on both pages), while the list violations are in the catalog filter component, which only the home page renders.
- The same violations were recorded in an earlier run (run-0669cd9d-fbd5-4ddc-8209-8102ff856471, 2026-10-22) and again in run-a3857cc2 (2026-10-26): the symptom is stable across runs.
- No source code is configured for this project, so no cause was read from code.

**Hypotheses**

- The navigation component sets a fixed aria-label ("Select language") on a button whose visible content is the current language name or code, so the accessible name overrides and no longer contains the visible text. (confidence: high)
- The category filter template renders each sub-category group as a <fieldset> placed directly inside a <ul> (instead of inside an <li>), for example from a loop that emits the fieldset in place of a list item. (confidence: medium)

**Remediation**

- Make the accessible name of #language contain its visible text: remove aria-label so the visible text names the button, or start the label with the visible text (for example 'EN, Select language'), tied to the label-content-name-mismatch fact.
- Wrap each <fieldset> in a <li>, or replace the <ul> with a non-list container such as a <div>, in the category filter, tied to the list-rule fact.
- Review the uncertain colour-contrast items (CO2 rating letters at about 2.3-2.8:1 and gradient/image backgrounds) manually; they are not part of this defect's confirmed violations.

### product-page-missing-stock-availability

**Facts**

- On the product page of Combination Pliers, a visible-text check for 'in stock' or 'out of stock' found no match (passed: false, observed: absent, matchCount: 0).
- The accessibility snapshot of the same page lists the name, price, description, quantity controls, 'Add to cart', 'Add to favourites', 'Compare' and a specifications table, and no availability text.
- The same product page shows name and price matching the list card, so the page and its data loaded correctly; only the availability indicator is absent.
- GET /products?page=1 returns Combination Pliers with the boolean field "in_stock": true, so the API already provides the availability data for this product. Its id in that response (01M5W4RF2VJYVX9HYFE00X8PSW) differs from the id in the product page URL of the earlier session.
- GET /products/01M5W1AMEHK9PTTSHSTK009S5Q, the id from that earlier page URL, returned 404; product ids changed between the two observations, so that 404 is not a product defect and the earlier page evidence cannot be re-fetched by that id.
- The case's earlier run (run-4e31f4df, 2026-10-22) was partial and has no evidence to compare, so there is no earlier result showing the indicator was ever present.
- No source code is configured for this project, so no cause was read from code.

**Hypotheses**

- The product page receives the in_stock flag from the API but only renders an availability element when it is false (an 'Out of stock' badge, like the list card) and has no 'In stock' branch, so available products show no availability text. (confidence: high)
- The product detail endpoint GET /products/{id} omits the in_stock field even though the list endpoint includes it, so the page has nothing to bind to. (confidence: low)

**Remediation**

- Add an 'In stock' indicator to the product page for products where in_stock is true, next to the price or the Add to cart button, and keep the existing 'Out of stock' label for unavailable ones, tied to the in_stock fact and the first hypothesis.
- If the detail endpoint turns out not to return in_stock, add it there, tied to the second hypothesis.
