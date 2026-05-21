import React from 'react';
import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';

export interface BreadcrumbCrumb {
  /** Display text for the crumb. */
  title: React.ReactNode;
  /** Optional link target. If omitted, crumb renders as plain text (terminal). */
  to?: string;
}

interface Props {
  /**
   * The crumbs AFTER "Home". `Home` is auto-prepended and links to `/`.
   * Example: [{ title: 'Orders', to: '/provider-orders' }, { title: 'Order #1234' }]
   */
  items: BreadcrumbCrumb[];
  /** Extra style/marginBottom. Default: marginBottom 16px. */
  style?: React.CSSProperties;
}

/**
 * Consistent breadcrumb for every page header. Always starts with a Home
 * link to `/`. Use as the first child inside a page wrapper, before titles.
 *
 * Usage:
 *   <PageBreadcrumb items={[{ title: 'Orders', to: '/provider-orders' }, { title: 'Order detail' }]} />
 */
const PageBreadcrumb: React.FC<Props> = ({ items, style }) => {
  const merged: any[] = [
    {
      title: (
        <Link to="/">
          <HomeOutlined />
          <span style={{ marginLeft: 6 }}>Home</span>
        </Link>
      ),
    },
    ...items.map((c) => ({
      title: c.to ? <Link to={c.to}>{c.title}</Link> : c.title,
    })),
  ];
  return <Breadcrumb items={merged} style={{ marginBottom: 16, ...style }} />;
};

export default PageBreadcrumb;
