// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Renders custom elements the way an Angular component library lays out its widgets: a host
// element wrapping the visible parts, ids generated per page load, and popups attached to `body`
// and linked back to their widget through `aria-controls`. Written from first principles for this
// fixture (P6-39); the structure is what the explorer's profile has to recognize.

const PAGE_SIZE = 10;
const ROW_HEIGHT_PX = 32;
const VIRTUAL_VIEWPORT_ROWS = 8;
const VIRTUAL_CHUNK_SIZE = 30;

function generatedId() {
  return `k-${crypto.randomUUID().slice(0, 8)}`;
}

function element(tag, attributes = {}, ...children) {
  const created = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    created.setAttribute(name, value);
  }
  created.append(...children);
  return created;
}

const openPopups = new Set();

function closeAllPopups() {
  for (const close of [...openPopups]) {
    close();
  }
}
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || event.target.closest('[data-popup-owner]') === null) {
    closeAllPopups();
  }
});

// A popup lives under `body`, not inside its widget, which is how the real thing avoids being
// clipped by the widget's ancestors.
function createPopup(host, anchor, content, closingDelayMs = 0) {
  const popupId = generatedId();
  const container = element(
    'div',
    { class: 'k-animation-container', 'data-popup-owner': popupId },
    element('div', { class: 'k-popup k-list-container' }, content(popupId)),
  );
  const wrapper = element('kendo-popup', {}, container);
  let isOpen = false;
  // The real popup ignores a click that lands while it is still animating open: it closes without
  // picking anything. Seen on a Kendo UI for Angular multiselect, whose option click closed the
  // list and chose nothing when it came a moment after the list opened (P6-64).
  container.addEventListener(
    'click',
    (event) => {
      if (container.getAnimations().length > 0) {
        event.stopPropagation();
        close();
      }
    },
    true,
  );
  function close() {
    if (isOpen) {
      wrapper.remove();
      openPopups.delete(close);
      isOpen = false;
      // The real list reports itself open until its closing animation ends.
      if (closingDelayMs > 0) {
        setTimeout(() => {
          if (!isOpen) {
            anchor.setAttribute('aria-expanded', 'false');
          }
        }, closingDelayMs);
      } else {
        anchor.setAttribute('aria-expanded', 'false');
      }
    }
  }
  function open() {
    closeAllPopups();
    document.body.append(wrapper);
    container.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 400 });
    anchor.setAttribute('aria-expanded', 'true');
    openPopups.add(close);
    isOpen = true;
  }
  anchor.setAttribute('aria-controls', `${popupId}-list`);
  anchor.setAttribute('aria-haspopup', 'listbox');
  anchor.setAttribute('aria-expanded', 'false');
  host.setAttribute('data-popup-owner', popupId);
  return { open, close, toggle: () => (isOpen ? close() : open()), popupId };
}

function createOptionList(popupId, values, onPick, selected = () => false) {
  return element(
    'ul',
    { id: `${popupId}-list`, role: 'listbox', class: 'k-list-ul' },
    ...values.map((value) => {
      const option = element(
        'li',
        { role: 'option', class: 'k-list-item', 'aria-selected': String(selected(value)) },
        element('span', { class: 'k-list-item-text' }, value),
      );
      option.addEventListener('click', () => {
        onPick(value);
      });
      return option;
    }),
  );
}

const summary = { status: 'none', owner: 'none', labels: 0 };
function updateSummary() {
  document.getElementById('selection-summary').textContent =
    `Status ${summary.status}, owner ${summary.owner}, ${String(summary.labels)} label(s).`;
}

function valuesOf(host) {
  return (host.getAttribute('data-values') ?? '').split(',').filter((value) => value.length > 0);
}

function renderDropDownList(host) {
  host.classList.add('k-dropdownlist', 'k-picker');
  host.setAttribute('role', 'combobox');
  host.setAttribute('tabindex', '0');
  const text = element('span', { class: 'k-input-value-text' }, 'Select...');
  host.append(
    element('span', { class: 'k-input-inner' }, text),
    element(
      'button',
      { class: 'k-input-button', tabindex: '-1', 'aria-hidden': 'true', type: 'button' },
      'v',
    ),
  );
  const popup = createPopup(host, host, (popupId) =>
    createOptionList(popupId, valuesOf(host), (value) => {
      // BUG-017: the model changes but the displayed text never does.
      summary.status = value;
      updateSummary();
      popup.close();
    }),
  );
  host.addEventListener('click', popup.toggle);
}

function renderComboBox(host) {
  host.classList.add('k-combobox', 'k-input');
  const input = element('input', {
    class: 'k-input-inner',
    role: 'combobox',
    type: 'text',
    placeholder: 'Pick or type a name',
    'aria-autocomplete': 'list',
    id: generatedId(),
  });
  const toggle = element(
    'button',
    { class: 'k-input-button', tabindex: '-1', 'aria-label': 'Open owners', type: 'button' },
    'v',
  );
  host.append(input, toggle);
  const popup = createPopup(host, input, (popupId) =>
    createOptionList(popupId, valuesOf(host), (value) => {
      input.value = value;
      summary.owner = value;
      updateSummary();
      popup.close();
    }),
  );
  toggle.addEventListener('click', popup.toggle);
  input.addEventListener('change', () => {
    summary.owner = input.value || 'none';
    updateSummary();
  });
}

const CLOSING_ANIMATION_MS = 200;

function renderMultiSelect(host) {
  host.classList.add('k-multiselect', 'k-input');
  const chosen = new Set();
  const chips = element('kendo-taglist', { class: 'k-chip-list' });
  const input = element('input', {
    class: 'k-input-inner',
    role: 'combobox',
    type: 'text',
    id: generatedId(),
  });
  host.append(chips, input);
  function refresh() {
    chips.replaceChildren(
      ...[...chosen].map((value) => element('span', { class: 'k-chip', role: 'option' }, value)),
    );
    summary.labels = chosen.size;
    updateSummary();
  }
  const popup = createPopup(
    host,
    input,
    (popupId) =>
      createOptionList(
        popupId,
        valuesOf(host),
        (value) => {
          if (chosen.has(value)) {
            chosen.delete(value);
          } else {
            chosen.add(value);
          }
          refresh();
          // Like the real multiselect, the list closes after every pick.
          popup.close();
        },
        (value) => chosen.has(value),
      ),
    CLOSING_ANIMATION_MS,
  );
  input.addEventListener('click', popup.toggle);
  // Pressing Escape while the list is still closing after a pick drops that pick, as the real
  // multiselect does (P6-64).
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.getAttribute('aria-expanded') === 'true' && chosen.size > 0) {
      chosen.delete([...chosen].at(-1));
      refresh();
    }
  });
}

function renderDatePicker(host) {
  host.classList.add('k-datepicker', 'k-input');
  const input = element('input', {
    class: 'k-input-inner',
    type: 'text',
    role: 'spinbutton',
    placeholder: 'yyyy-mm-dd',
    id: generatedId(),
  });
  const toggle = element(
    'button',
    { class: 'k-input-button', 'aria-label': 'Toggle calendar', type: 'button' },
    'c',
  );
  host.append(element('kendo-dateinput', {}, input), toggle);
  const popup = createPopup(host, toggle, (popupId) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: days }, (_unused, index) => {
      const day = index + 1;
      const cell = element('td', { role: 'gridcell' }, element('span', { class: 'k-link' }, String(day)));
      cell.addEventListener('click', () => {
        input.value = `${String(year)}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        popup.close();
      });
      return cell;
    });
    const rows = [];
    for (let start = 0; start < cells.length; start += 7) {
      rows.push(element('tr', { role: 'row' }, ...cells.slice(start, start + 7)));
    }
    return element('kendo-calendar', { id: `${popupId}-list` }, element('table', { role: 'grid' }, ...rows));
  });
  toggle.addEventListener('click', popup.toggle);
}

function renderNumericTextBox(host) {
  host.classList.add('k-numerictextbox', 'k-input');
  const min = Number(host.getAttribute('data-min'));
  const max = Number(host.getAttribute('data-max'));
  const input = element('input', {
    class: 'k-input-inner',
    role: 'spinbutton',
    type: 'text',
    'aria-valuemin': String(min),
    'aria-valuemax': String(max),
    'aria-valuenow': String(min),
    id: generatedId(),
  });
  input.value = String(min);
  const increase = element(
    'button',
    { 'aria-label': 'Increase value', class: 'k-spinner-increase', type: 'button' },
    '+',
  );
  const decrease = element(
    'button',
    { 'aria-label': 'Decrease value', class: 'k-spinner-decrease', type: 'button' },
    '-',
  );
  host.append(input, element('span', { class: 'k-input-spinner' }, increase, decrease));
  function set(value) {
    input.value = String(value);
    input.setAttribute('aria-valuenow', String(value));
  }
  increase.addEventListener('click', () => {
    set(Math.min(max, Number(input.value) + 1));
  });
  decrease.addEventListener('click', () => {
    set(Math.max(min, Number(input.value) - 1));
  });
  // BUG-018: a typed value is accepted as is, past the declared maximum.
  input.addEventListener('change', () => {
    set(Number(input.value));
  });
}

function renderTabStrip(host) {
  const tabs = ['Details', 'History'].map((title) => ({ title, id: generatedId(), panelId: generatedId() }));
  const list = element('ul', { role: 'tablist', class: 'k-tabstrip-items' });
  const details = document.getElementById('details-panel-content');
  const panels = [
    element('div', { role: 'tabpanel', class: 'k-tabstrip-content' }),
    element(
      'div',
      { role: 'tabpanel', class: 'k-tabstrip-content' },
      element('p', { id: 'history-panel' }, 'No history yet.'),
    ),
  ];
  panels[0]?.append(details);
  function select(index) {
    tabs.forEach((tab, tabIndex) => {
      const item = list.children[tabIndex];
      item?.setAttribute('aria-selected', String(tabIndex === index));
      panels[tabIndex]?.toggleAttribute('hidden', tabIndex !== index);
    });
  }
  tabs.forEach((tab, index) => {
    const item = element(
      'li',
      { role: 'tab', id: tab.id, tabindex: '0', 'aria-controls': tab.panelId },
      element('span', { class: 'k-link' }, tab.title),
    );
    item.addEventListener('click', () => {
      select(index);
    });
    list.append(item);
    panels[index]?.setAttribute('id', tab.panelId);
    panels[index]?.setAttribute('aria-labelledby', tab.id);
  });
  host.append(element('div', { class: 'k-tabstrip-items-wrapper' }, list), ...panels);
  select(0);
}

function openEditWindow() {
  const overlay = element('div', { class: 'k-overlay' });
  // BUG-019: the dialog is not labelled by its title, so it has no accessible name.
  const dialog = element(
    'div',
    { class: 'k-window k-window-md', role: 'dialog' },
    element(
      'div',
      { class: 'k-window-titlebar' },
      element('span', { class: 'k-window-title' }, 'Edit details'),
      element('button', { 'aria-label': 'Close', type: 'button', id: 'window-close' }, 'x'),
    ),
    element('div', { class: 'k-window-content' }, element('p', {}, 'Window content')),
  );
  const wrapper = element('kendo-window', {}, dialog);
  document.body.append(overlay, wrapper);
  wrapper.querySelector('#window-close')?.addEventListener('click', () => {
    wrapper.remove();
    overlay.remove();
  });
}

async function fetchPeople(skip, take) {
  const response = await fetch(`/api/kendo/people?skip=${String(skip)}&take=${String(take)}`);
  return response.json();
}

function personRow(person, index) {
  return element(
    'tr',
    { role: 'row', 'data-row-index': String(index) },
    element('td', { role: 'gridcell' }, String(person.id)),
    element('td', { role: 'gridcell' }, person.name),
    element('td', { role: 'gridcell' }, person.department),
  );
}

function gridShell(host) {
  const head = element(
    'tr',
    { role: 'row' },
    ...['ID', 'Name', 'Department'].map((title) => element('th', { role: 'columnheader' }, title)),
  );
  const body = element('tbody', { role: 'rowgroup' });
  const table = element(
    'table',
    { role: 'grid', class: 'k-grid-table' },
    element('thead', { role: 'rowgroup' }, head),
    body,
  );
  const content = element('div', { class: 'k-grid-container' }, table);
  host.classList.add('k-grid');
  host.append(content);
  return { body, content, table };
}

async function renderPagedGrid(host) {
  const { body } = gridShell(host);
  const previous = element('button', { type: 'button', 'aria-label': 'Go to the previous page' }, '<');
  const next = element('button', { type: 'button', 'aria-label': 'Go to the next page' }, '>');
  const info = element('span', { class: 'k-pager-info', role: 'status' });
  host.append(element('kendo-pager', { class: 'k-pager' }, previous, info, next));
  let page = 1;
  async function load() {
    const { total, items } = await fetchPeople((page - 1) * PAGE_SIZE, PAGE_SIZE);
    const pageCount = Math.ceil(total / PAGE_SIZE);
    body.replaceChildren(...items.map((person, index) => personRow(person, (page - 1) * PAGE_SIZE + index)));
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

// Only the rows near the viewport exist in the DOM; a tall spacer keeps the scrollbar the size of
// the whole data set.
async function renderVirtualGrid(host) {
  const { body, content, table } = gridShell(host);
  content.style.height = `${String(VIRTUAL_VIEWPORT_ROWS * ROW_HEIGHT_PX + ROW_HEIGHT_PX)}px`;
  content.style.overflowY = 'auto';
  content.style.position = 'relative';
  const spacer = element('div', { class: 'k-height-container' });
  content.append(spacer);
  table.style.position = 'absolute';
  table.style.left = '0';
  table.style.right = '0';
  const chunks = new Map();
  let total = 0;
  async function loadChunk(chunkIndex) {
    if (!chunks.has(chunkIndex)) {
      const result = await fetchPeople(chunkIndex * VIRTUAL_CHUNK_SIZE, VIRTUAL_CHUNK_SIZE);
      total = result.total;
      chunks.set(chunkIndex, result.items);
    }
  }
  async function render() {
    const first = Math.floor(content.scrollTop / ROW_HEIGHT_PX);
    const last = first + VIRTUAL_VIEWPORT_ROWS;
    for (const chunkIndex of new Set([
      Math.floor(first / VIRTUAL_CHUNK_SIZE),
      Math.floor(last / VIRTUAL_CHUNK_SIZE),
    ])) {
      await loadChunk(chunkIndex);
    }
    spacer.style.height = `${String((total + 1) * ROW_HEIGHT_PX)}px`;
    table.style.top = `${String(content.scrollTop)}px`;
    const rows = [];
    for (let index = first; index < Math.min(last, total); index += 1) {
      const person = chunks.get(Math.floor(index / VIRTUAL_CHUNK_SIZE))?.[index % VIRTUAL_CHUNK_SIZE];
      if (person !== undefined) {
        rows.push(personRow(person, index));
      }
    }
    body.replaceChildren(...rows);
  }
  content.addEventListener('scroll', () => {
    void render();
  });
  await render();
}

document.querySelectorAll('kendo-dropdownlist').forEach(renderDropDownList);
document.querySelectorAll('kendo-combobox').forEach(renderComboBox);
document.querySelectorAll('kendo-multiselect').forEach(renderMultiSelect);
document.querySelectorAll('kendo-datepicker').forEach(renderDatePicker);
document.querySelectorAll('kendo-numerictextbox').forEach(renderNumericTextBox);
document.querySelectorAll('kendo-tabstrip').forEach(renderTabStrip);
document.getElementById('open-edit-window')?.addEventListener('click', openEditWindow);
void renderPagedGrid(document.getElementById('paged-grid'));
void renderVirtualGrid(document.getElementById('virtual-grid'));
