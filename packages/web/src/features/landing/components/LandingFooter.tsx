import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';

const FooterWrap = styled.footer`
  background: #040810;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 48px 24px 32px;
`;

const Inner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 40px;
  margin-bottom: 48px;
  @media(max-width: 768px) { grid-template-columns: 1fr 1fr; }
  @media(max-width: 480px) { grid-template-columns: 1fr; }
`;

const Brand = styled.div`
  div:first-child {
    font-size: 22px;
    font-weight: 700;
    color: #1BAEE5;
    margin-bottom: 8px;
  }
  p {
    font-size: 14px;
    color: rgba(255,255,255,0.4);
    line-height: 1.6;
    margin: 0;
  }
`;

const ColTitle = styled.div`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.3);
  margin-bottom: 14px;
`;

const ColLinks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  a {
    font-size: 14px;
    color: rgba(255,255,255,0.5);
    text-decoration: none;
    &:hover { color: #fff; }
  }
`;

const Bottom = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  border-top: 1px solid rgba(255,255,255,0.05);
  padding-top: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: rgba(255,255,255,0.3);
  flex-wrap: wrap;
  gap: 8px;
`;

export const LandingFooter: React.FC = () => (
  <FooterWrap>
    <Inner>
      <Brand>
        <div>Curavend</div>
        <p>Healthcare supply chain, reimagined for the cloud. Multi-tenant, HIPAA-aware, Cloudflare-native.</p>
      </Brand>
      <div>
        <ColTitle>Product</ColTitle>
        <ColLinks>
          <Link to="/login">Sign In</Link>
          <a href="mailto:info@curavend.com?subject=Request Access">Request Access</a>
        </ColLinks>
      </div>
      <div>
        <ColTitle>Platform</ColTitle>
        <ColLinks>
          <a href="#features">Features</a>
          <a href="#security">Security</a>
          <a href="#integrations">Integrations</a>
        </ColLinks>
      </div>
      <div>
        <ColTitle>Legal</ColTitle>
        <ColLinks>
          <a href="mailto:privacy@curavend.com">Privacy</a>
          <a href="mailto:legal@curavend.com">Terms</a>
          <a href="mailto:security@curavend.com">Security</a>
        </ColLinks>
      </div>
    </Inner>
    <Bottom>
      <span>© 2026 Curavend. All rights reserved.</span>
      <span>Built on Cloudflare Workers · D1 · R2 · Workers AI</span>
    </Bottom>
  </FooterWrap>
);
