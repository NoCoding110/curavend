import React from 'react';
import { useLocation } from 'react-router-dom';
import PageBreadcrumb from '../PageBreadcrumb';
import { matchBreadcrumbs } from '../../lib/routeBreadcrumbs';
import { useBreadcrumbContext } from '../../contexts/BreadcrumbContext';

/**
 * Renders a route-aware breadcrumb at the top of every authenticated page.
 * Reads:
 *   1. `useBreadcrumbContext().override` — set by `useBreadcrumbOverride()`
 *      on pages that need dynamic crumbs (e.g. an order number).
 *   2. Fallback: `matchBreadcrumbs(location.pathname)` from the registry.
 * Renders nothing if neither yields crumbs (e.g. unknown route).
 */
const AutoBreadcrumb: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const { override } = useBreadcrumbContext();
  const location = useLocation();
  const items = override ?? matchBreadcrumbs(location.pathname);
  if (!items || items.length === 0) return null;
  return <PageBreadcrumb items={items} style={style} />;
};

export default AutoBreadcrumb;
