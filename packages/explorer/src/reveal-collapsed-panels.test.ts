// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  createFakeCrawlPage,
  type FakeCrawlPage,
  type FakeCrawlPageOptions,
} from '@qa-ai-stlc/test-utils/fake-crawl-browser-launcher';
import {
  COLLAPSED_PANEL_SELECTOR,
  DEFAULT_MAX_EXPANSIONS_PER_PAGE,
  revealCollapsedPanels,
} from './reveal-collapsed-panels.js';

const PAGE_URL = 'https://example.com/search';

interface RoundArgument {
  readonly selector: string;
  readonly deniedPattern: string;
  readonly limit: number;
}

async function openPage(
  options: FakeCrawlPageOptions,
): Promise<{ page: FakeCrawlPage; roundArguments: RoundArgument[] }> {
  const page = createFakeCrawlPage(options);
  const roundArguments: RoundArgument[] = [];
  const evaluate = page.evaluate.bind(page);
  const recording: FakeCrawlPage = {
    ...page,
    evaluate: (pageFunction, argument) => {
      if (pageFunction.name === 'clickCollapsedControls') {
        roundArguments.push(argument as RoundArgument);
      }
      return evaluate(pageFunction, argument);
    },
  };
  await recording.goto(PAGE_URL);
  return { page: recording, roundArguments };
}

describe('revealCollapsedPanels', () => {
  it('clicks the collapsed controls of each round until a round finds none', async () => {
    const { page, roundArguments } = await openPage({
      revealRoundsByUrl: { [PAGE_URL]: [2, 1, 0] },
    });

    const clickedCount = await revealCollapsedPanels(page, { pageUrl: PAGE_URL });

    expect(clickedCount).toBe(3);
    expect(roundArguments.map((argument) => argument.limit)).toEqual([
      DEFAULT_MAX_EXPANSIONS_PER_PAGE,
      DEFAULT_MAX_EXPANSIONS_PER_PAGE - 2,
      DEFAULT_MAX_EXPANSIONS_PER_PAGE - 3,
    ]);
  });

  it('makes at most three rounds', async () => {
    const { page, roundArguments } = await openPage({
      revealRoundsByUrl: { [PAGE_URL]: [1, 1, 1, 1] },
    });

    expect(await revealCollapsedPanels(page, { pageUrl: PAGE_URL })).toBe(3);
    expect(roundArguments).toHaveLength(3);
  });

  it('stops once the cap on clicks is reached', async () => {
    const { page, roundArguments } = await openPage({ revealRoundsByUrl: { [PAGE_URL]: [2, 5] } });

    const clickedCount = await revealCollapsedPanels(page, { pageUrl: PAGE_URL, maxExpansions: 2 });

    expect(clickedCount).toBe(2);
    expect(roundArguments).toHaveLength(1);
  });

  it('adds the selectors a component library profile names to the ones for aria-expanded', async () => {
    const { page, roundArguments } = await openPage({ revealRoundsByUrl: { [PAGE_URL]: [0] } });

    await revealCollapsedPanels(page, { pageUrl: PAGE_URL, extraSelectors: ['.panel-header'] });

    expect(roundArguments[0]?.selector).toBe(`${COLLAPSED_PANEL_SELECTOR}, .panel-header`);
  });

  it('skips controls whose name says they destroy something', async () => {
    const { page, roundArguments } = await openPage({ revealRoundsByUrl: { [PAGE_URL]: [0] } });

    await revealCollapsedPanels(page, { pageUrl: PAGE_URL });

    expect(new RegExp(roundArguments[0]?.deniedPattern ?? '', 'i').test('Delete section')).toBe(true);
  });

  it('counts nothing when the page does not answer', async () => {
    const page = createFakeCrawlPage({});

    expect(await revealCollapsedPanels(page, { pageUrl: PAGE_URL })).toBe(0);
  });

  it('loads the page again and stops when a click destroyed its script context', async () => {
    const { page } = await openPage({
      revealRoundsByUrl: { [PAGE_URL]: [1, 'context-destroyed'] },
    });

    const clickedCount = await revealCollapsedPanels(page, { pageUrl: PAGE_URL });

    expect(clickedCount).toBe(1);
    expect(page.gotoUrls).toEqual([PAGE_URL, PAGE_URL]);
  });

  it('loads the page again and stops when a click navigated away from it', async () => {
    const { page } = await openPage({
      revealRoundsByUrl: { [PAGE_URL]: [{ navigatesTo: 'https://example.com/elsewhere' }, 1] },
    });

    const clickedCount = await revealCollapsedPanels(page, { pageUrl: PAGE_URL });

    expect(clickedCount).toBe(1);
    expect(page.gotoUrls).toEqual([PAGE_URL, PAGE_URL]);
  });
});
