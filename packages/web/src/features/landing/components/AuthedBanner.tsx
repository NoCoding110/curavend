import React from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

const Banner = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: rgba(27,174,229,0.95);
  backdrop-filter: blur(8px);
  padding: 10px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
`;

const DashLink = styled(Link)`
  background: rgba(255,255,255,0.2);
  border-radius: 6px;
  padding: 4px 12px;
  color: #fff;
  text-decoration: none;
  font-weight: 700;
  &:hover { background: rgba(255,255,255,0.3); color: #fff; }
`;

export const AuthedBanner: React.FC = () => {
  const token = useSelector((s: any) => s.auth?.token);
  const user = useSelector((s: any) => s.auth?.userData);

  return (
    <AnimatePresence>
      {token && (
        <Banner
          initial={{ y: -48 }}
          animate={{ y: 0 }}
          exit={{ y: -48 }}
          transition={{ duration: 0.35 }}
        >
          <span>Welcome back{user?.name ? `, ${user.name}` : ''} — you're already signed in</span>
          <DashLink to="/dashboard">Go to Dashboard →</DashLink>
        </Banner>
      )}
    </AnimatePresence>
  );
};
