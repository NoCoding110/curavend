/**
 * useFhirLaunchContext — read the Epic launch context the API stashed in URL hash
 * or sessionStorage after a successful FHIR OAuth round trip.
 *
 * The bounce page (`FhirLaunchBounce.tsx`) is the one that parses the URL hash
 * and stashes it. Wizards and order-detail pages use this hook to find out
 * whether the current session is bound to an Epic patient/encounter, and which
 * connection to call.
 */
import { useEffect, useState } from 'react';

const SESSION_KEY = 'curavend_fhir_context';

export interface FhirLaunchContext {
  connId: string;
  patientId?: string;
  encounterId?: string;
  fhirUser?: string;
  /** Set true when the launch context is populated (came from Epic this session). */
  isFromEpic: boolean;
}

const EMPTY: FhirLaunchContext = { connId: '', isFromEpic: false };

/** Save the context — called by the bounce page once on arrival. */
export function setFhirLaunchContext(ctx: Omit<FhirLaunchContext, 'isFromEpic'>): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx));
  } catch {
    /* sessionStorage disabled — ignore */
  }
}

/** Drop the context — called on disconnect. */
export function clearFhirLaunchContext(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** One-shot read (e.g. from outside React). */
export function readFhirLaunchContext(): FhirLaunchContext {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Omit<FhirLaunchContext, 'isFromEpic'>;
    if (!parsed.connId) return EMPTY;
    return { ...parsed, isFromEpic: true };
  } catch {
    return EMPTY;
  }
}

/** React hook variant — re-reads on mount, returns memoized value. */
export function useFhirLaunchContext(): FhirLaunchContext {
  const [ctx, setCtx] = useState<FhirLaunchContext>(EMPTY);

  useEffect(() => {
    setCtx(readFhirLaunchContext());
  }, []);

  return ctx;
}
