import React from 'react';
import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';

export interface BreadcrumbCrumb {
  /** Display text for the crumb. */
  title: React.ReactNode;
  /** Optional link target. If omitted, crumb renders as plain text (terminal). */
  to?: string;
}

interface Props {
  /**
   * The crumbs for this page.
   * Example: [{ title: 'Orders', to: '/provider-orders' }, { title: 'Order #1234' }]
   *
   * NOTE: do NOT include a "Home" crumb. `/` is the public marketing
   * landing page and intentionally never appears in authed-page
   * breadcrumbs. Start with the first real section instead.
   */
  items: BreadcrumbCrumb[];
  /** Extra style/marginBottom. Default: marginBottom 16px. */
  style?: React.CSSProperties;
}

/**
 * Consistent breadcrumb for every page header. Renders the supplied
 * crumbs as-is — no Home prefix is auto-prepended because `/` is the
 * public landing page and shouldn't be linked from authed pages.
 */
const PageBreadcrumb: React.FC<Props> = ({ items, style }) => {
  const rendered = items.map((c) => ({
    title: c.to ? <Link to={c.to}>{c.title}</Link> : c.title,
  }));
  return <Breadcrumb items={rendered} style={{ marginBottom: 16, ...style }} />;
};

export default PageBreadcrumb;
