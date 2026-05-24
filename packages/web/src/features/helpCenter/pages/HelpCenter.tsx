/**
 * In-app training documentation viewer.
 *
 * Renders the docs from /public/docs/ (mirrored from /docs/training/ by
 * scripts/sync-docs.mjs at build time). Three sections:
 *   - Personas (role-specific quickstarts)
 *   - Features (page-by-page reference)
 *   - Workflows (step-by-step recipes)
 *
 * The doc tree is fetched from /docs/manifest.json — sync-docs.mjs generates
 * it so we don't have to hardcode the list.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Layout,
  Menu,
  Input,
  Typography,
  Card,
  Spin,
  Alert,
  Empty,
  Space,
  Tag,
  Button,
} from 'antd';
import {
  BookOutlined,
  UserOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  DownloadOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import styled from 'styled-components';
import 'highlight.js/styles/github.css';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store/store';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { usePermissions } from '../../../hooks/usePermissions';
import type { PermissionResource } from '../../../api/userPermissions';

const { Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const PageWrap = styled.div`
  height: calc(100vh - 64px);
  background: #fff;
`;

const StyledSider = styled(Sider)`
  background: #fafafa !important;
  border-right: 1px solid #f0f0f0;
  height: 100%;
  overflow-y: auto;
`;

const DocPanel = styled.div`
  padding: 32px 48px;
  max-width: 920px;
  margin: 0 auto;
  height: 100%;
  overflow-y: auto;

  /* Headings */
  h1 {
    font-size: 30px;
    font-weight: 700;
    margin-top: 0;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid #f0f0f0;
  }
  h2 {
    font-size: 22px;
    font-weight: 600;
    margin-top: 32px;
    margin-bottom: 12px;
    color: #1f1f1f;
  }
  h3 {
    font-size: 17px;
    font-weight: 600;
    margin-top: 24px;
    margin-bottom: 8px;
  }
  p {
    line-height: 1.7;
    color: #333;
  }
  ul, ol {
    line-height: 1.8;
  }
  code {
    background: #f6f8fa;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.92em;
    color: #c7254e;
  }
  pre code {
    background: transparent;
    color: inherit;
    padding: 0;
  }
  pre {
    background: #f6f8fa;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    border: 1px solid #e1e4e8;
  }
  blockquote {
    border-left: 4px solid #1BAEE5;
    padding: 8px 16px;
    color: #555;
    background: #f8fbfd;
    margin: 16px 0;
    border-radius: 0 4px 4px 0;
  }
  table {
    border-collapse: collapse;
    margin: 16px 0;
    width: 100%;
  }
  th, td {
    border: 1px solid #e1e4e8;
    padding: 8px 12px;
    text-align: left;
  }
  th {
    background: #f6f8fa;
    font-weight: 600;
  }
  img {
    max-width: 100%;
    border: 1px solid #e1e4e8;
    border-radius: 6px;
    margin: 16px 0;
  }
  a {
    color: #1BAEE5;
  }
`;

interface DocEntry {
  slug: string;
  title: string;
  path: string;
}
interface Manifest {
  personas: DocEntry[];
  features: DocEntry[];
  workflows: DocEntry[];
  index: { path: string };
}

const SECTION_ICON: Record<string, React.ReactNode> = {
  personas: <UserOutlined />,
  features: <AppstoreOutlined />,
  workflows: <ThunderboltOutlined />,
};

/**
 * Doc visibility rules. Each entry's value is a predicate over (roles, can()):
 * returns true → doc is visible to this user. ADMIN sees everything.
 *
 * Keep this in sync with the doc filenames in docs/training/{personas,features,workflows}.
 */
type RoleFlags = ReturnType<typeof useUserRoles>;
type CanFn = (r: PermissionResource, level: 'READ' | 'WRITE' | 'FULL') => boolean;
type DocPredicate = (roles: RoleFlags, can: CanFn) => boolean;

const ALWAYS: DocPredicate = () => true;
const ROLE = (key: keyof RoleFlags): DocPredicate => (roles) => !!roles[key];
const PERM = (resource: PermissionResource): DocPredicate => (_, can) => can(resource, 'READ');
const ANY = (...preds: DocPredicate[]): DocPredicate => (roles, can) => preds.some((p) => p(roles, can));

const PERSONA_VISIBILITY: Record<string, DocPredicate> = {
  hospital: ROLE('isHospital'),
  vendor: ROLE('isVendor'),
  lab: ROLE('isLab'),
  provider: ROLE('isProvider'),
  'super-vendor': ROLE('isSuperVendor'),
  admin: ROLE('isAdmin'),
};

const FEATURE_VISIBILITY: Record<string, DocPredicate> = {
  '01-dashboard': ALWAYS,
  '02-orders': PERM('orders'),
  '03-requisitions': PERM('requisitions'),
  '04-formulary': PERM('formulary'),
  '05-approvals': ANY(ROLE('isHospital'), ROLE('isVendor'), ROLE('isAdmin'), ROLE('isProvider'), ROLE('isSuperVendor')),
  '06-prior-auths': ANY(ROLE('isHospital'), ROLE('isAdmin'), ROLE('isProvider')),
  '07-goods-receipts': PERM('goods-receipts'),
  '08-three-way-match': PERM('goods-receipts'),
  '09-invoices': ALWAYS,
  '10-contracts-pricing': PERM('contracts'),
  '11-gpo-contracts': ROLE('isAdmin'),
  '12-payors-eligibility': ROLE('isAdmin'),
  '13-forecasting': ANY(ROLE('isHospital'), ROLE('isVendor'), ROLE('isAdmin')),
  '14-multi-site-spend': ANY(ROLE('isHospital'), ROLE('isAdmin')),
  '15-contract-leakage': ANY(ROLE('isHospital'), ROLE('isAdmin')),
  '16-ehr-connections': ROLE('isAdmin'),
  '17-vendor-scorecard': ANY(ROLE('isHospital'), ROLE('isAdmin'), ROLE('isVendor')),
  '18-user-management': ROLE('isAdmin'),
  '19-permissions-groups': ROLE('isAdmin'),
  '20-notifications': ALWAYS,
  // DME Ordering — visible to hospital + provider + admin
  '21-dme-order-wizard': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  '22-dme-document-packet': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  '23-lcd-coverage-checker': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  '24-cms-pa-required-list': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  '25-dwo-claim-bundle': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  '26-dmepos-compliance': ROLE('isAdmin'),
  // Lab Operations — visible to lab + hospital + admin
  '27-lab-inventory': ANY(ROLE('isLab'), ROLE('isHospital'), ROLE('isAdmin')),
  '28-lab-forecasting': ANY(ROLE('isLab'), ROLE('isHospital'), ROLE('isAdmin')),
  '29-backorders': ANY(ROLE('isLab'), ROLE('isHospital'), ROLE('isAdmin')),
  '30-lab-auto-consumption': ANY(ROLE('isLab'), ROLE('isHospital'), ROLE('isAdmin')),
  // Procurement Finance — visible to hospital + admin (ledger is admin-only)
  '31-hospital-budgets': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '32-po-transmission': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '33-department-spend': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '34-gl-ledger': ROLE('isAdmin'),
  // Procurement v2 — supplier onboarding, RMAs, hygiene, POU, cross-site,
  // compliance, backorder triage, logistics cold-chain
  '35-supplier-onboarding': ROLE('isAdmin'),
  '36-rma-workflow': ANY(ROLE('isAdmin'), ROLE('isHospital'), ROLE('isVendor')),
  '37-invoice-match-rules': ROLE('isAdmin'),
  '38-item-master-hygiene': ROLE('isAdmin'),
  '39-point-of-use-capture': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '40-cross-site-inventory': ANY(ROLE('isAdmin'), ROLE('isHospital'), ROLE('isLab'), ROLE('isVendor')),
  '41-compliance-dashboard': ROLE('isAdmin'),
  '42-backorder-triage': ANY(ROLE('isAdmin'), ROLE('isHospital'), ROLE('isVendor')),
  '43-logistics-cold-chain': ANY(ROLE('isAdmin'), ROLE('isHospital'), ROLE('isVendor')),
  // Procurement v3 — emergency purchasing, transfers, recalls, controlled
  // substance log, substitutions, scorecard snapshots, hospital forecast,
  // charge capture leakage, price variance
  '44-emergency-purchasing': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '45-inventory-transfers': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '46-recalls': ROLE('isAdmin'),
  '47-controlled-substance-log': ROLE('isAdmin'),
  '48-substitution-audit-log': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '49-vendor-scorecard-snapshots': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '50-hospital-demand-forecast': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '51-charge-capture-leakage': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '52-price-variance': ANY(ROLE('isAdmin'), ROLE('isHospital')),
};

const WORKFLOW_VISIBILITY: Record<string, DocPredicate> = {
  '01-onboard-a-vendor': ROLE('isAdmin'),
  '02-create-and-submit-requisition': PERM('requisitions'),
  '03-approve-requisition-and-convert': PERM('requisitions'),
  '04-record-goods-receipt': PERM('goods-receipts'),
  '05-resolve-match-exception': PERM('goods-receipts'),
  '06-set-up-approval-rules': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '07-create-formulary-with-substitutes': PERM('formulary'),
  '08-process-prior-authorization': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  '09-run-multi-site-spend-report': ANY(ROLE('isHospital'), ROLE('isAdmin')),
  '10-detect-contract-leakage': ANY(ROLE('isHospital'), ROLE('isAdmin')),
  '11-onboard-a-lab': ROLE('isAdmin'),
  '12-onboard-a-hospital': ROLE('isAdmin'),
  '13-configure-ehr-feed': ROLE('isAdmin'),
  '14-grant-user-permissions': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  '15-set-up-gpo-membership': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  // DME Ordering workflows — visible to hospital + provider + admin
  '16-create-dme-order-end-to-end': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  '17-upload-dme-document-packet': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  '18-generate-dme-claim-bundle': ANY(ROLE('isHospital'), ROLE('isProvider'), ROLE('isAdmin')),
  // Lab Operations workflows — visible to lab + hospital + admin
  '19-receive-lab-shipment': ANY(ROLE('isLab'), ROLE('isHospital'), ROLE('isAdmin')),
  '20-set-up-test-consumable-map': ANY(ROLE('isLab'), ROLE('isHospital'), ROLE('isAdmin')),
  '21-audit-stock-movements': ANY(ROLE('isLab'), ROLE('isAdmin')),
  // Procurement v2 workflows
  '22-handle-damaged-shipment': ANY(ROLE('isAdmin'), ROLE('isHospital')),
  // Procurement v3 workflows
  '23-handle-emergency-purchase': ANY(ROLE('isAdmin'), ROLE('isHospital')),
};

const VISIBILITY_BY_SECTION: Record<string, Record<string, DocPredicate>> = {
  personas: PERSONA_VISIBILITY,
  features: FEATURE_VISIBILITY,
  workflows: WORKFLOW_VISIBILITY,
};

export const HelpCenter: React.FC = () => {
  const roles = useUserRoles();
  const { can } = usePermissions();
  const userData = useSelector((s: RootState) => s.auth.userData);
  // Admins see every doc; everyone else gets filtered.
  const seeAll = roles.isAdmin;

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [activePath, setActivePath] = useState<string>('/docs/README.md');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/docs/manifest.json');
        if (!r.ok) throw new Error('Failed to load manifest');
        const m: Manifest = await r.json();
        setManifest(m);
      } catch {
        setManifest({ personas: [], features: [], workflows: [], index: { path: '/docs/README.md' } });
      }
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(activePath)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => setContent(t))
      .catch(() => setContent(`# Document not found\n\nCould not load \`${activePath}\`.`))
      .finally(() => setLoading(false));
  }, [activePath]);

  // Build menu items, filtered by search
  const matchesSearch = (e: DocEntry) =>
    !search ||
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.slug.toLowerCase().includes(search.toLowerCase());

  const buildSection = (key: 'personas' | 'features' | 'workflows', label: string) => {
    const entries = manifest?.[key] ?? [];
    // 1) Filter by role/permission visibility (admins skip the filter)
    const visibility = VISIBILITY_BY_SECTION[key] ?? {};
    const visible = seeAll
      ? entries
      : entries.filter((e) => {
          const pred = visibility[e.slug];
          // Unknown docs default to visible — better to over-show than hide content
          // a user might need; admins can update the visibility map.
          return pred ? pred(roles, can as CanFn) : true;
        });
    // 2) Filter by search box
    const filtered = visible.filter(matchesSearch);
    if (filtered.length === 0) return null;
    return {
      key,
      label: (
        <Space>
          {SECTION_ICON[key]}
          <strong>{label}</strong>
          <Tag>{filtered.length}</Tag>
        </Space>
      ),
      type: 'group' as const,
      children: filtered.map((e) => ({
        key: e.path,
        label: e.title,
      })),
    };
  };

  const menuItems = useMemo(() => {
    if (!manifest) return [];
    const items: any[] = [
      {
        key: '/docs/README.md',
        icon: <HomeOutlined />,
        label: 'Index',
      },
      { type: 'divider' },
    ];
    const sections = [
      buildSection('personas', 'Personas'),
      buildSection('features', 'Features'),
      buildSection('workflows', 'Workflows'),
    ].filter(Boolean);
    items.push(...(sections as any[]));
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, search, seeAll, roles.isHospital, roles.isVendor, roles.isLab, roles.isProvider, roles.isSuperVendor]);

  // Resolve relative MD links (`../features/01-dashboard.md`) -> absolute /docs paths
  const resolveLink = (href: string): string => {
    if (!href) return '#';
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return href;
    // Relative path resolved against current doc directory
    const parts = activePath.split('/').slice(0, -1);
    for (const seg of href.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.') parts.push(seg);
    }
    return parts.join('/');
  };

  const isMdLink = (href: string) => href.endsWith('.md');

  return (
    <PageWrap>
      <Layout style={{ height: '100%', background: '#fff' }}>
        <StyledSider width={300}>
          <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <BookOutlined style={{ color: '#1BAEE5', fontSize: 18 }} />
                <Title level={5} style={{ margin: 0 }}>Help Center</Title>
              </Space>
              {userData && (
                <Tag color={seeAll ? 'purple' : 'blue'} style={{ marginRight: 0 }}>
                  {seeAll ? 'Admin view — all docs' : `Filtered for your role`}
                </Tag>
              )}
              <Input
                placeholder="Search docs…"
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                size="small"
              />
            </Space>
          </div>
          {manifest ? (
            <Menu
              mode="inline"
              selectedKeys={[activePath]}
              items={menuItems as any}
              onClick={({ key }) => {
                if (typeof key === 'string' && key.endsWith('.md')) setActivePath(key);
              }}
              style={{ background: 'transparent', border: 'none' }}
            />
          ) : (
            <div style={{ padding: 16 }}><Spin /></div>
          )}
        </StyledSider>

        <Content style={{ background: '#fff', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>
          ) : !content ? (
            <Empty description="No content" style={{ marginTop: 96 }} />
          ) : (
            <DocPanel>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  a: ({ href, children, ...props }) => {
                    const resolved = resolveLink(href ?? '');
                    if (isMdLink(resolved)) {
                      return (
                        <a
                          href={resolved}
                          onClick={(e) => {
                            e.preventDefault();
                            setActivePath(resolved);
                          }}
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    }
                    return <a href={resolved} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer" {...props}>{children}</a>;
                  },
                  img: ({ src, alt, ...props }) => (
                    <img src={resolveLink(src ?? '')} alt={alt} {...props} />
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </DocPanel>
          )}
        </Content>
      </Layout>
    </PageWrap>
  );
};

export default HelpCenter;
