import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

/* ─── Styled components ─────────────────────────────────────────────────── */

const Nav = styled(motion.nav)<{ $scrolled: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 32px;
  transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
  background: ${p => p.$scrolled
    ? 'rgba(7,12,20,0.88)'
    : 'transparent'};
  border-bottom: 1px solid ${p => p.$scrolled
    ? 'rgba(255,255,255,0.07)'
    : 'transparent'};
  backdrop-filter: ${p => p.$scrolled ? 'blur(18px)' : 'none'};
  @media(max-width: 640px) { padding: 0 16px; }
`;

const Inner = styled.div`
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 0;
`;

const Logo = styled(Link)`
  font-size: 20px;
  font-weight: 800;
  color: #1BAEE5;
  text-decoration: none;
  letter-spacing: -0.02em;
  flex-shrink: 0;
  &:hover { color: #3bc8f0; }
`;

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 32px;
  @media(max-width: 768px) { display: none; }
`;

const NavLink = styled.a`
  font-size: 14px;
  font-weight: 500;
  color: rgba(255,255,255,0.55);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  transition: color 0.18s, background 0.18s;
  cursor: pointer;
  &:hover {
    color: #fff;
    background: rgba(255,255,255,0.06);
  }
`;

const DocsLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255,255,255,0.55);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  transition: color 0.18s, background 0.18s;
  cursor: pointer;
  &:hover {
    color: #1BAEE5;
    background: rgba(27,174,229,0.08);
  }
  svg { flex-shrink: 0; }
`;

const Spacer = styled.div`flex: 1;`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SignInBtn = styled(Link)`
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  background: #1BAEE5;
  padding: 8px 20px;
  border-radius: 8px;
  transition: background 0.18s, transform 0.18s;
  &:hover {
    background: #0e8dc0;
    transform: translateY(-1px);
  }
`;

const MobileMenuBtn = styled.button`
  display: none;
  background: none;
  border: none;
  color: rgba(255,255,255,0.6);
  font-size: 22px;
  cursor: pointer;
  padding: 4px 8px;
  @media(max-width: 768px) { display: flex; align-items: center; }
`;

const MobileMenu = styled(motion.div)`
  position: fixed;
  top: 64px;
  left: 0;
  right: 0;
  z-index: 199;
  background: rgba(7,12,20,0.97);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  backdrop-filter: blur(18px);
  padding: 12px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const MobileNavLink = styled.a`
  font-size: 15px;
  font-weight: 500;
  color: rgba(255,255,255,0.7);
  text-decoration: none;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  &:hover { background: rgba(255,255,255,0.06); color: #fff; }
`;

const MobileDocsLink = styled.a`
  font-size: 15px;
  font-weight: 500;
  color: #1BAEE5;
  text-decoration: none;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  &:hover { background: rgba(27,174,229,0.08); }
`;

const MobileSignIn = styled(Link)`
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  background: #1BAEE5;
  padding: 12px 16px;
  border-radius: 8px;
  margin-top: 8px;
  text-align: center;
  &:hover { background: #0e8dc0; }
`;

/* ─── Download icon ─────────────────────────────────────────────────────── */
const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginTop: 1 }}>
    <path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ─── Scroll-to helpers ─────────────────────────────────────────────────── */
const scrollTo = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ─── Component ─────────────────────────────────────────────────────────── */
export const LandingNav: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const close = () => setMobileOpen(false);

  return (
    <>
      <Nav $scrolled={scrolled} initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Inner>
          <Logo to="/">Curavend</Logo>

          <NavLinks>
            <NavLink as={Link} to="/explore" style={{ color: '#1BAEE5' }}>Explore →</NavLink>
            <NavLink onClick={() => scrollTo('features')}>Personas</NavLink>
            <NavLink onClick={() => scrollTo('security')}>Security</NavLink>
            <NavLink onClick={() => scrollTo('integrations')}>Integrations</NavLink>
            <DocsLink href="/docs/platform-reference.docx" download="Curavend_Platform_Page_Reference.docx">
              <DownloadIcon />
              Platform Docs
            </DocsLink>
          </NavLinks>

          <Spacer />

          <Actions>
            <SignInBtn to="/login">Sign in →</SignInBtn>
            <MobileMenuBtn
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? '✕' : '☰'}
            </MobileMenuBtn>
          </Actions>
        </Inner>
      </Nav>

      <AnimatePresence>
        {mobileOpen && (
          <MobileMenu
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <MobileNavLink as={Link} to="/explore" onClick={close} style={{ color: '#1BAEE5' }}>Explore →</MobileNavLink>
            <MobileNavLink onClick={() => { scrollTo('features'); close(); }}>Personas</MobileNavLink>
            <MobileNavLink onClick={() => { scrollTo('security'); close(); }}>Security</MobileNavLink>
            <MobileNavLink onClick={() => { scrollTo('integrations'); close(); }}>Integrations</MobileNavLink>
            <MobileDocsLink
              href="/docs/platform-reference.docx"
              download="Curavend_Platform_Page_Reference.docx"
              onClick={close}
            >
              <DownloadIcon /> Platform Docs
            </MobileDocsLink>
            <MobileSignIn to="/login" onClick={close}>Sign in →</MobileSignIn>
          </MobileMenu>
        )}
      </AnimatePresence>
    </>
  );
};
