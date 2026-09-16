// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

/** The current time, injected so artifact timestamps are deterministic in tests. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
