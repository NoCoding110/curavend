import React, { useEffect } from 'react';
import styled from 'styled-components';
import { Spin } from 'antd';

// This page handles the post-Epic-OAuth bounce.
// The SMART redirect lands here (/fhir-launch-bounce) with an authorization code.
// We immediately forward it to the API's /api/fhir/redirect handler which
// exchanges the code for tokens and stores the FHIR connection.
// The API then redirects the user back to the SPA at the intended destination.

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #070C14;
  gap: 24px;
`;

const Message = styled.p`
  color: rgba(255,255,255,0.6);
  font-size: 16px;
`;

const FhirLaunchBounce: React.FC = () => {
  useEffect(() => {
    // Forward the full query string to the API FHIR redirect handler.
    const apiBase = import.meta.env.VITE_API_URL ?? 'https://curavend-api.metabilityllc1.workers.dev/api';
    const qs = window.location.search;
    // The API will handle the code exchange and then redirect back to /dashboard or /create-order.
    window.location.replace(`${apiBase}/fhir/redirect${qs}`);
  }, []);

  return (
    <Wrap>
      <Spin size="large" />
      <Message>Completing Epic connection…</Message>
    </Wrap>
  );
};

export default FhirLaunchBounce;
