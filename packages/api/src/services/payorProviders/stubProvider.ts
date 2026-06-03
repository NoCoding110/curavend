import type {
  EligibilityProvider, EligibilityResult, EligibilityCheckInput,
  PriorAuthProvider, PriorAuthSubmitResult, PriorAuthSubmitInput,
} from './types';

/**
 * Stub eligibility provider — deterministic hash-based response.
 * Replaces the inline logic in routes/payors.ts.
 * Every response includes `simulated: true` so the UI can badge it.
 */
export class StubEligibilityProvider implements EligibilityProvider {
  async check(input: EligibilityCheckInput): Promise<EligibilityResult> {
    const hashed = [...input.patientMemberId].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);
    const isActive = hashed % 7 !== 0;
    const copay = Number(((hashed % 50) + 5).toFixed(2));
    const deductible = 1500;
    const deductibleMet = Number((((hashed % 13) * 100) + 200).toFixed(2));
    return {
      status: isActive ? 'ACTIVE' : 'INACTIVE',
      benefitNotes: isActive
        ? `Active coverage. Plan year deductible $${deductible}. (Simulated — EDI 270/271 not yet wired.)`
        : `Member ID not found or coverage lapsed. (Simulated.)`,
      copayUsd: isActive ? copay : null,
      deductibleUsd: isActive ? deductible : null,
      deductibleMetUsd: isActive ? deductibleMet : null,
      simulated: true,
      rawResponse: { stub: true, memberId: input.patientMemberId, active: isActive },
    };
  }
}

/**
 * Stub PA submission provider — always succeeds with a SIM- reference number.
 */
export class StubPriorAuthProvider implements PriorAuthProvider {
  async submit(input: PriorAuthSubmitInput): Promise<PriorAuthSubmitResult> {
    return {
      accepted: true,
      externalRef: `SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      simulated: true,
      rawResponse: { stub: true, priorAuthId: input.priorAuthId },
    };
  }
}
