import { describe, expect, it } from 'vitest';

import { shouldRenderProcessFlowSessionPanel } from '../sessionSupport';

describe('process flow session support', () => {
  it('does not render facilitator/session UI when facilitator mode is unsupported', () => {
    expect(
      shouldRenderProcessFlowSessionPanel({
        isEmbedded: true,
        sdkContext: { launchMode: 'facilitator', supportsFacilitatorMode: false },
        currentSession: { id: 'session-1' },
      })
    ).toBe(false);
  });

  it('renders session UI only when embedded facilitator support is enabled', () => {
    expect(
      shouldRenderProcessFlowSessionPanel({
        isEmbedded: true,
        sdkContext: { launchMode: 'facilitator', supportsFacilitatorMode: true },
        currentSession: null,
      })
    ).toBe(true);
  });
});
