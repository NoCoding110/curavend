/**
 * Catalog browse — hospital users see SKUs from their contracted vendors,
 * with resolved per-hospital pricing (CONTRACT > MEDICARE > LIST).
 *
 * Vendor users see their own SKUs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Input,
  Row,
  Col,
  Tag,
  Empty,
  Skeleton,
  Image,
  Space,
  Pagination,
  Button,
} from 'antd';
import { SearchOutlined, LinkOutlined, FilePdfOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { catalogApi, type CatalogItem } from '../../../api/catalog';

const { Title, Text, Paragraph } = Typography;

const PageWrap = styled.div`padding: 24px;`;

const ProductCard = styled(Card)`
  height: 100%;
  display: flex;
  flex-direction: column;
  .ant-card-cover {
    height: 160px;
    background: #fafafa;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ant-card-cover img {
    max-height: 160px;
    object-fit: contain;
  }
`;

const SOURCE_BADGE: Record<string, string> = {
  CONTRACT: 'green',
  MEDICARE: 'blue',
  LIST: 'default',
};

const Catalog: React.FC = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await catalogApi.list({ q: q || undefined, limit: pageSize, offset: (page - 1) * pageSize });
      setItems(resp.items ?? []);
      setTotal(resp.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>Product Catalog</Title>
            <Text type="secondary">Browse available SKUs with your hospital-specific prices</Text>
          </div>
          <Input.Search
            allowClear
            placeholder="Search HCPC, description, manufacturer…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSearch={(v) => { setPage(1); setQ(v.trim()); }}
            style={{ width: 360 }}
            enterButton={<SearchOutlined />}
          />
        </Space>
      </Card>

      {loading ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Col xs={24} sm={12} md={8} lg={6} key={i}><Card><Skeleton active /></Card></Col>
          ))}
        </Row>
      ) : items.length === 0 ? (
        <Card><Empty description={q ? `No SKUs match "${q}"` : 'No catalog items available'} /></Card>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {items.map((item) => {
              const price = item.resolvedPriceCents != null
                ? `$${(item.resolvedPriceCents / 100).toFixed(2)}`
                : '—';
              const imgSrc = item.imageUrl || item.groupCoverImageUrl || null;
              return (
                <Col xs={24} sm={12} md={8} lg={6} key={item.id}>
                  <ProductCard
                    size="small"
                    cover={
                      imgSrc ? (
                        <Image src={imgSrc} preview={false} alt={item.description ?? item.hcpcCode} fallback="" />
                      ) : (
                        <Text type="secondary" style={{ fontSize: 32 }}>📦</Text>
                      )
                    }
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space size={4}>
                        <Tag color={SOURCE_BADGE[item.priceSource] ?? 'default'} style={{ marginRight: 0 }}>
                          {item.hcpcCode}
                        </Tag>
                        {item.groupName && <Text type="secondary" style={{ fontSize: 11 }}>{item.groupName}</Text>}
                      </Space>
                      <Text strong ellipsis={{ tooltip: item.description ?? item.vendorSku }}>
                        {item.description ?? item.vendorSku}
                      </Text>
                      {item.tagline && (
                        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }} ellipsis={{ rows: 2, tooltip: item.tagline }}>
                          {item.tagline}
                        </Paragraph>
                      )}
                      <Space size={4} wrap>
                        <Text strong style={{ fontSize: 16 }}>{price}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{item.currencyCode}</Text>
                        <Tag color={SOURCE_BADGE[item.priceSource]}>{item.priceSource}</Tag>
                      </Space>
                      <Space size={4} style={{ fontSize: 11 }}>
                        <Text type="secondary">MOQ:</Text> {item.minimumOrderQuantity}
                        {item.packMultiple > 1 && <><Text type="secondary"> · pack:</Text> {item.packMultiple}</>}
                        {item.vendorName && <Text type="secondary"> · {item.vendorName}</Text>}
                      </Space>
                      {(item.datasheetUrl || item.groupDatasheetUrl) && (
                        <Space size={4}>
                          <Button
                            size="small"
                            type="link"
                            icon={<FilePdfOutlined />}
                            href={item.datasheetUrl ?? item.groupDatasheetUrl ?? '#'}
                            target="_blank"
                            style={{ padding: 0 }}
                          >
                            Datasheet
                          </Button>
                        </Space>
                      )}
                    </Space>
                  </ProductCard>
                </Col>
              );
            })}
          </Row>
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(p) => setPage(p)}
              showSizeChanger={false}
            />
          </div>
        </>
      )}
    </PageWrap>
  );
};

export default Catalog;
