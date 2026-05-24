/**
 * Sticky top banner shown when the visitor is already authenticated.
 *
 * Gives them a 1-click path to the Dashboard without auto-redirecting (so
 * they can still browse the marketing page if they want).
 */
import React from 'react';
import styled from 'styled-components';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { RootState } from '../../../store/store';
import { colors, easings } from '../lib/motionTokens';

const BannerWrap = styled(motion.div)`
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  padding: 10px 24px;
  background: linear-gradient(90deg, ${colors.bg2} 0%, ${colors.bg3} 100%);
  border-bottom: 1px solid ${colors.hairlineStrong};
  color: ${colors.text};
  font-size: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
`;

const GoLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${colors.brandGlow};
  font-weight: 600;
  text-decoration: none;
  &:hover {
    color: ${colors.text};
  }
`;

export const AuthedBanner: React.FC = () => {
  const user = useSelector((s: RootState) => s.auth.userData);
  const token = useSelector((s: RootState) => s.auth.token);
  if (!token || !user) return null;

  return (
    <AnimatePresence>
      <BannerWrap
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        transition={{ duration: 0.4, ease: easings.ease }}
      >
        <span>
          Welcome back, <strong style={{ color: colors.text }}>{user.name || user.email}</strong>
        </span>
        <GoLink to="/dashboard">
          Go to Dashboard <ArrowRightOutlined />
        </GoLink>
      </BannerWrap>
    </AnimatePresence>
  );
};

export default AuthedBanner;
