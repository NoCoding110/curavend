import React from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';

const FullPageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
`;

const FullPageLayout: React.FC = () => {
  return (
    <FullPageWrapper>
      <Outlet />
    </FullPageWrapper>
  );
};

export default FullPageLayout;
