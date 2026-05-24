/**
 * Footer — minimal, dark, 4-column.
 */
import React from 'react';
import styled from 'styled-components';
import { Container } from '../lib/primitives';
import { colors } from '../lib/motionTokens';
import { Wordmark } from '../assets/illustrations';

const FootWrap = styled.footer`
  background: ${colors.bg0};
  border-top: 1px solid ${colors.hairline};
  padding: 64px 0 40px 0;
  color: ${colors.textDim};
  font-size: 13px;
`;

const Cols = styled.div`
  display: grid;
  grid-template-columns: 2fr repeat(3, 1fr);
  gap: 48px;
  @media (max-width: 720px) {
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
`;

const Col = styled.div`
  & h4 {
    font-size: 11px;
    font-weight: 700;
    color: ${colors.textMuted};
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin: 0 0 16px 0;
  }
  & a {
    display: block;
    color: ${colors.textDim};
    text-decoration: none;
    margin-bottom: 10px;
    transition: color 0.2s;
    &:hover {
      color: ${colors.text};
    }
  }
`;

const Brand = styled.div`
  & p {
    color: ${colors.textMuted};
    margin: 12px 0 0 0;
    line-height: 1.5;
    max-width: 36ch;
  }
`;

const Bottom = styled.div`
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid ${colors.hairline};
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
  color: ${colors.textMuted};
`;

export const Footer: React.FC = () => {
  return (
    <FootWrap>
      <Container>
        <Cols>
          <Brand>
            <Wordmark size={22} />
            <p>Healthcare supply chain, reimagined for the cloud.</p>
          </Brand>
          <Col>
            <h4>Product</h4>
            <a href="/login">Sign in</a>
            <a href="mailto:hello@curavend.com">Request access</a>
          </Col>
          <Col>
            <h4>Platform</h4>
            <a href="#">Documentation</a>
            <a href="#">Changelog</a>
            <a href="#">Status</a>
          </Col>
          <Col>
            <h4>Legal</h4>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Security</a>
          </Col>
        </Cols>
        <Bottom>
          <span>© {new Date().getFullYear()} Curavend. All rights reserved.</span>
          <span>Built on Cloudflare</span>
        </Bottom>
      </Container>
    </FootWrap>
  );
};

export default Footer;
