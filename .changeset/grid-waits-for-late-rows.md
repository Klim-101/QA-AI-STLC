---
'@qa-ai-stlc/core': patch
---

`qa.browser_grid_find_row` and `qa.browser_grid_read_cell` wait for a grid that loads its rows after the page is shown. They used to read the grid at once, saw a scroll container with nothing to scroll, took it for a grid that renders every row and reported the row missing after one position (`BROWSER_GRID_ROW_NOT_FOUND ... after visiting 1 page(s)`). The first look now waits, for as long as an action may take, until at least one row is rendered; after a page change or a scroll it still waits only for the rows to change.
