# Example artifacts

Real output of the QA-AI-STLC engine from a run against the public sample shop
[Practice Software Testing](https://practicesoftwaretesting.com/), kept as it was written. The
defects found are defects of that demo application, not of this project. Nothing here is a
guarantee of what your application will produce.

| File                                                                                                          | What it is                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [run-result-2026-10-26.md](run-result-2026-10-26.md)                                                          | The run result report (`qa report`), rendered from the recorded results.        |
| [product-page-missing-stock-availability.json](product-page-missing-stock-availability.json)                  | An accepted functional defect.                                                  |
| [a11y-catalog-product-wcag-violations.json](a11y-catalog-product-wcag-violations.json)                        | A defect draft, still unaccepted.                                               |
| [a11y-language-button-and-list-markup.json](a11y-language-button-and-list-markup.json)                        | An approved root cause analysis (its defect was accepted from a similar draft). |

Run ids and evidence paths point into the `.qa/` folder of the project that produced them and do not
resolve in this repository. The demo site reseeds its data, so product ids change between runs.
