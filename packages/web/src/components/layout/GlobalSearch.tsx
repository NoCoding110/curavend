/**
 * Global search bar — lives in the top header. Searches orders + SKUs +
 * contracts in one round-trip; renders grouped results in a dropdown.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Input, Dropdown, Space, Typography, Tag, Spin, Empty } from 'antd';
import { SearchOutlined, FileTextOutlined, ShoppingOutlined, FileDoneOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { searchApi, type SearchResponse } from '../../api/search';

const { Text } = Typography;

const DropdownBox = styled.div`
  width: 460px;
  max-height: 460px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.08);
  padding: 8px;
`;

const RowItem = styled.div`
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  align-items: center;
  &:hover { background: #f5f5f5; }
`;

const TYPE_ICON: Record<string, React.ReactNode> = {
  orders: <FileTextOutlined />,
  skus: <ShoppingOutlined />,
  contracts: <FileDoneOutlined />,
};

const GlobalSearch: React.FC = () => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<SearchResponse | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q || q.trim().length < 2) {
      setResp(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchApi.query(q.trim(), undefined, 8);
        setResp(r);
        setOpen(true);
      } catch {
        setResp(null);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const navigateTo = (type: string, id: string) => {
    setOpen(false);
    if (type === 'orders') navigate(`/provider-orders/${id}`);
    else if (type === 'skus') navigate('/sku-catalog');
    else if (type === 'contracts') navigate(`/contracts/${id}`);
  };

  const content = (
    <DropdownBox>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
      ) : !resp || resp.total === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No results for "${q}"`} />
      ) : (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {resp.groups.filter((g) => g.total > 0).map((group) => (
            <div key={group.type}>
              <div style={{ padding: '4px 8px', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
                {group.type} ({group.total})
              </div>
              {group.results.map((r: any) => (
                <RowItem key={`${group.type}-${r.id}`} onClick={() => navigateTo(group.type, r.id)}>
                  <span style={{ color: '#1677ff' }}>{TYPE_ICON[group.type]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {group.type === 'orders' && (
                      <>
                        <Text strong style={{ marginRight: 6 }}>{r.identifier}</Text>
                        <Tag>{r.orderSubStatus}</Tag>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {r.patientName ?? ''} {r.patientLastName ?? ''}
                        </div>
                      </>
                    )}
                    {group.type === 'skus' && (
                      <>
                        <Text strong style={{ marginRight: 6 }}>{r.hcpcCode}</Text>
                        <span style={{ fontSize: 12 }}>{r.vendorSku}</span>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {(r.description ?? r.tagline ?? '').toString().slice(0, 60)}
                        </div>
                      </>
                    )}
                    {group.type === 'contracts' && (
                      <>
                        <Text strong>{r.name ?? r.id.slice(0, 8)}</Text>
                        <Tag color="blue" style={{ marginLeft: 6 }}>{r.status}</Tag>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {r.hospitalName ?? '—'} ↔ {r.vendorName ?? '—'}
                        </div>
                      </>
                    )}
                  </div>
                </RowItem>
              ))}
            </div>
          ))}
        </Space>
      )}
    </DropdownBox>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={(o) => setOpen(o)}
      dropdownRender={() => content}
      trigger={['click']}
      placement="bottomRight"
    >
      <Input
        prefix={<SearchOutlined style={{ color: '#888' }} />}
        placeholder="Search orders, SKUs, contracts…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (resp && resp.total > 0) setOpen(true); }}
        style={{ width: 280 }}
        allowClear
      />
    </Dropdown>
  );
};

export default GlobalSearch;
