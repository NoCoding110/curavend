import type { EligibilityProvider, PriorAuthProvider } from './types';
import { StubEligibilityProvider, StubPriorAuthProvider } from './stubProvider';

/**
 * Factory functions — returns the real adapter when CLEARINGHOUSE_PROVIDER is set,
 * otherwise the stub. Real adapter throws NOT_IMPLEMENTED as a seam placeholder.
 */
export function getEligibilityProvider(env: any): EligibilityProvider {
  if (env?.CLEARINGHOUSE_PROVIDER) {
    // Seam for future real integration (Availity, Change Healthcare, etc.)
    throw new Error('NOT_IMPLEMENTED: Real clearinghouse adapter not yet built. Set CLEARINGHOUSE_PROVIDER only when the real adapter is wired.');
  }
  return new StubEligibilityProvider();
}

export function getPriorAuthProvider(env: any): PriorAuthProvider {
  if (env?.CLEARINGHOUSE_PROVIDER) {
    throw new Error('NOT_IMPLEMENTED: Real prior-auth clearinghouse adapter not yet built.');
  }
  return new StubPriorAuthProvider();
}

export * from './types';
