/**
 * ViewInEpicButton — opens the patient's chart in Epic in a new tab.
 *
 * Renders nothing unless the order is bound to an Epic connection AND that
 * connection has a `deepLinkTemplate` configured in its `mappingProfile`.
 * The server resolves the URL so the template never leaks to the client
 * unless it's the one we should be using.
 *
 * Phase 1.G — Curavend → Epic chart navigation.
 */
import React, { useEffect, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { ApiOutlined, ExportOutlined } from '@ant-design/icons';
import { get } from '../../../api/client';

interface Props {
  /** EhrConnection.id bound to the order (orders.epic_connection_id). */
  connectionId?: string | null;
  /** FHIR Patient.id (orders.fhir_patient_id). */
  patientId?: string | null;
  /** Optional encounter to deep-link to. */
  encounterId?: string | null;
  /** Style passthrough. */
  size?: 'small' | 'middle' | 'large';
}

const ViewInEpicButton: React.FC<Props> = ({
  connectionId,
  patientId,
  encounterId,
  size = 'middle',
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connectionId || !patientId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params: Record<string, string> = { patientId };
        if (encounterId) params.encounterId = encounterId;
        const r = await get<{ url: string | null }>(
          `/fhir/${connectionId}/deep-link`,
          params,
        );
        if (!cancelled) setUrl(r.url);
      } catch {
        if (!cancelled) setUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [connectionId, patientId, encounterId]);

  if (!url && !loading) return null;
  return (
    <Tooltip title="Open this patient's chart in Epic">
      <Button
        size={size}
        icon={<ApiOutlined />}
        loading={loading}
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
      >
        View in Epic <ExportOutlined style={{ fontSize: 10 }} />
      </Button>
    </Tooltip>
  );
};

export default ViewInEpicButton;
