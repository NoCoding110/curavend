import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

/**
 * TurnstileWidget — Cloudflare Turnstile bot-protection widget.
 *
 * Loads Turnstile's JS once, renders an invisible-by-default managed
 * challenge, and surfaces the resulting token via `onVerify`. Re-renders
 * cleanly between login attempts via the imperative `reset()` handle.
 *
 * The widget is a no-op (renders nothing, immediately calls onVerify(''))
 * when VITE_TURNSTILE_SITE_KEY is unset — keeps local dev unblocked.
 *
 * Usage:
 *   const turnstileRef = useRef<TurnstileHandle>(null);
 *   <TurnstileWidget ref={turnstileRef} onVerify={setToken} />
 *   // after a failed submit:
 *   turnstileRef.current?.reset();
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'invisible' | 'flexible';
          appearance?: 'always' | 'execute' | 'interaction-only';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
    onloadTurnstileCallback?: () => void;
  }
}

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${TURNSTILE_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile-script-failed')));
      // If already loaded by the time we check
      if (window.turnstile) resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = TURNSTILE_SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile-script-failed'));
    document.head.appendChild(s);
  });

  return scriptPromise;
}

export interface TurnstileHandle {
  /** Reset the widget — call after a failed submit so the user can try again. */
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Called with the resulting token (or '' when no site key configured). */
  onVerify: (token: string) => void;
  /** Called on widget error (network, expired challenge, etc.). */
  onError?: () => void;
  /** Match Curavend's color scheme. */
  theme?: 'light' | 'dark' | 'auto';
}

export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  ({ onVerify, onError, theme = 'light' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      // No site key → frontend bypass (must be paired with backend bypass when
      // TURNSTILE_SECRET_KEY is unset there).
      if (!siteKey) {
        onVerify('');
        return;
      }

      let cancelled = false;

      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            appearance: 'always', // always render the widget so the user can see pass/fail
            size: 'normal',
            callback: (token: string) => onVerify(token),
            'error-callback': () => onError?.(),
            'expired-callback': () => {
              // Auto-reset on expiry so a stale token isn't reused
              if (widgetIdRef.current && window.turnstile) {
                window.turnstile.reset(widgetIdRef.current);
              }
            },
          });
        })
        .catch(() => {
          // Network / script failure — surface to caller; backend will still
          // refuse the submit so we fail closed.
          onError?.();
        });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
        }
        widgetIdRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteKey, theme]);

    if (!siteKey) return null;
    return <div ref={containerRef} style={{ minHeight: 0 }} />;
  },
);

TurnstileWidget.displayName = 'TurnstileWidget';
