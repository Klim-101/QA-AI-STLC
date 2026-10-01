// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

/* global $ */

const PAGE_SIZE = 10;
const ROW_HEIGHT_PX = 32;
const VIRTUAL_VIEWPORT_ROWS = 8;
const VIRTUAL_CHUNK_SIZE = 30;

$('#tabs').kendoTabStrip();

const prioritySelect = $('#priority').kendoDropDownList().data('kendoDropDownList');
const assigneeCombo = $('#assignee')
  .kendoComboBox({
    dataSource: ['Avery', 'Blake', 'Casey', 'Devon'],
    placeholder: 'Pick or type a name',
  })
  .data('kendoComboBox');
const tagsSelect = $('#tags').kendoMultiSelect().data('kendoMultiSelect');
// BUG-014: no `min`, although the label promises "today or later".
$('#due-date').kendoDatePicker({ format: 'yyyy-MM-dd' });
$('#estimate').kendoNumericTextBox({ min: 0, max: 40, step: 1, format: '0 h' });

function updateSummary() {
  const tags = tagsSelect.value();
  document.getElementById('selection-summary').textContent =
    `Priority ${prioritySelect.value()}, assignee ${assigneeCombo.value() || 'none'}, ` +
    `${String(tags.length)} tag(s).`;
}
prioritySelect.bind('change', updateSummary);
assigneeCombo.bind('change', updateSummary);
tagsSelect.bind('change', updateSummary);

const editWindow = $('#edit-window')
  .kendoWindow({ title: 'Edit details', modal: true, visible: false, width: 360, actions: ['Close'] })
  .data('kendoWindow');
document.getElementById('open-edit-window').addEventListener('click', () => {
  editWindow.center().open();
});
document.getElementById('window-cancel').addEventListener('click', () => {
  editWindow.close();
});
document.getElementById('window-apply').addEventListener('click', () => {
  // BUG-016: the window closes without copying the note out.
  editWindow.close();
});

async function fetchPeople(skip, take) {
  const response = await fetch(`/api/kendo/people?skip=${String(skip)}&take=${String(take)}`);
  return response.json();
}

function createCell(tag, text, role) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  cell.setAttribute('role', role);
  return cell;
}

function createGridShell(host, label) {
  host.classList.add('k-grid');
  host.setAttribute('role', 'grid');
  host.setAttribute('aria-label', label);
  const header = document.createElement('div');
  header.className = 'k-grid-header';
  const headerRow = document.createElement('div');
  headerRow.setAttribute('role', 'row');
  for (const title of ['ID', 'Name', 'Department']) {
    headerRow.append(createCell('div', title, 'columnheader'));
  }
  header.append(headerRow);
  const content = document.createElement('div');
  content.className = 'k-grid-content';
  host.append(header, content);
  return content;
}

function createRow(person, index) {
  const row = document.createElement('div');
  row.setAttribute('role', 'row');
  row.setAttribute('data-row-index', String(index));
  row.append(
    createCell('div', String(person.id), 'gridcell'),
    createCell('div', person.name, 'gridcell'),
    createCell('div', person.department, 'gridcell'),
  );
  return row;
}

async function createPagedGrid() {
  const host = document.getElementById('paged-grid');
  const content = createGridShell(host, 'People (paged)');
  const pager = document.createElement('nav');
  pager.className = 'k-pager';
  pager.setAttribute('aria-label', 'Pager');
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.textContent = 'Previous page';
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next page';
  const info = document.createElement('span');
  info.setAttribute('role', 'status');
  pager.append(previous, info, next);
  host.append(pager);

  let page = 1;
  let pageCount = 1;
  async function load() {
    const { total, items } = await fetchPeople((page - 1) * PAGE_SIZE, PAGE_SIZE);
    pageCount = Math.ceil(total / PAGE_SIZE);
    content.replaceChildren(
      ...items.map((person, index) => createRow(person, (page - 1) * PAGE_SIZE + index)),
    );
    info.textContent = `Page ${String(page)} of ${String(pageCount)}`;
    previous.disabled = page <= 1;
    next.disabled = page >= pageCount;
  }
  previous.addEventListener('click', () => {
    page -= 1;
    void load();
  });
  next.addEventListener('click', () => {
    page += 1;
    void load();
  });
  await load();
}

// Only the rows near the viewport exist in the DOM; a spacer keeps the scrollbar the size of the
// whole data set, which is what makes a row outside the viewport unreachable without scrolling.
async function createVirtualGrid() {
  const host = document.getElementById('virtual-grid');
  const content = createGridShell(host, 'People (virtual scrolling)');
  content.style.height = `${String(VIRTUAL_VIEWPORT_ROWS * ROW_HEIGHT_PX)}px`;
  content.style.overflowY = 'auto';
  content.style.position = 'relative';
  const spacer = document.createElement('div');
  const rows = document.createElement('div');
  rows.style.position = 'absolute';
  rows.style.left = '0';
  rows.style.right = '0';
  content.append(spacer, rows);

  const chunks = new Map();
  let total = 0;
  async function loadChunk(chunkIndex) {
    if (!chunks.has(chunkIndex)) {
      const { total: reportedTotal, items } = await fetchPeople(
        chunkIndex * VIRTUAL_CHUNK_SIZE,
        VIRTUAL_CHUNK_SIZE,
      );
      total = reportedTotal;
      chunks.set(chunkIndex, items);
    }
    return chunks.get(chunkIndex);
  }
  async function render() {
    const first = Math.floor(content.scrollTop / ROW_HEIGHT_PX);
    const last = first + VIRTUAL_VIEWPORT_ROWS;
    const needed = new Set([Math.floor(first / VIRTUAL_CHUNK_SIZE), Math.floor(last / VIRTUAL_CHUNK_SIZE)]);
    for (const chunkIndex of needed) {
      await loadChunk(chunkIndex);
    }
    spacer.style.height = `${String(total * ROW_HEIGHT_PX)}px`;
    rows.style.top = `${String(first * ROW_HEIGHT_PX)}px`;
    const visible = [];
    for (let index = first; index < Math.min(last, total); index += 1) {
      const person = chunks.get(Math.floor(index / VIRTUAL_CHUNK_SIZE))?.[index % VIRTUAL_CHUNK_SIZE];
      if (person !== undefined) {
        visible.push(createRow(person, index));
      }
    }
    for (const row of visible) {
      row.style.height = `${String(ROW_HEIGHT_PX)}px`;
    }
    rows.replaceChildren(...visible);
  }
  content.addEventListener('scroll', () => {
    void render();
  });
  await render();
}

void createPagedGrid();
void createVirtualGrid();
