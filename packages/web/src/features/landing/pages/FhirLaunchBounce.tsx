/**
 * FhirLaunchBounce — landing target after the API completes Epic OAuth.
 *
 * The Worker redirect handler (`/api/fhir/redirect`) sends the browser to
 * `https://curavend-web.pages.dev/fhir-launch-bounce#ctx=<base64-blob>`
 * carrying `{ connId, patientId?, encounterId?, fhirUser? }`. We decode it,
 * stash it in sessionStorage, then navigate to the right wizard based on what
 * data Epic gave us.
 *
 * Routing rules:
 *   - patient + encounter      → CreateDmeOrder (the encounter-scoped flow)
 *   - patient only             → CreateSupplyOrder (lighter-weight wizard)
 *   - no patient (admin flow)  → dashboard with a toast
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Alert, Typography, Card, Space } from 'antd';
import styled from 'styled-components';
import { setFhirLaunchContext } from '../../../hooks/useFhirLaunchContext';

const { Title, Text } = Typography;

const Wrap = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
`;

interface Ctx {
  connId: string;
  patientId?: string;
  encounterId?: string;
  fhirUser?: string;
}

/** Try to decode the `#ctx=<base64>` blob. */
function parseHashCtx(): Ctx | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/ctx=([^&]+)/);
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const parsed = JSON.parse(decoded) as Ctx;
    if (!parsed.connId) return null;
    return parsed;
  } catch {
    return null;
  }
}

const FhirLaunchBounce: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctx = parseHashCtx();
    if (!ctx) {
      setError(
        'No launch context found in URL. If you reached this page directly, return to the dashboard and try again.',
      );
      return;
    }

    // Persist for the rest of the session.
    setFhirLaunchContext(ctx);

    // Pick destination based on what Epic gave us.
    let target = '/dashboard';
    if (ctx.patientId && ctx.encounterId) {
      target = '/create-dme-order?fhirContext=1';
    } else if (ctx.patientId) {
      target = '/create-order?fhirContext=1';
    }
    // Brief delay so the user sees the "connected" state before redirect.
    const t = setTimeout(() => navigate(target, { replace: true }), 600);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <Wrap>
      <Card style={{ width: 480, textAlign: 'center' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {error ? (
            <Alert type="error" message="Launch context missing" description={error} />
          ) : (
            <>
              <Spin size="large" />
              <Title level={4} style={{ margin: 0 }}>Connecting to Epic…</Title>
              <Text type="secondary">Loading patient context. One moment.</Text>
            </>
          )}
        </Space>
      </Card>
    </Wrap>
  );
};

export default FhirLaunchBounce;
