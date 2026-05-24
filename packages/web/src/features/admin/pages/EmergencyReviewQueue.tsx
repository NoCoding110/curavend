/**
 * Admin: Emergency requisition review queue.
 *
 * Lists requisitions submitted as `isEmergency=true` that auto-approved
 * via the fast lane. Operator reviews each post-hoc and marks OK or FLAG.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Modal, Row, Space, Table, Tag, Typography, message, Input } from 'antd';
import { ThunderboltOutlined, CheckOutlined, FlagOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface Req {
  id: string;
  requisitionNumber: string;
  title: string;
  estimatedTotalUsd: number | null;
  emergencyReason: string | null;
  approvedAt: string;
  requestedByUserId: string;
}

const EmergencyReviewQueuePage: React.FC = () => {
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Req[] }>('/requisitions/emergency-review-queue');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const review = (id: string, decision: 'REVIEWED_OK' | 'REVIEWED_FLAG') => {
    Modal.confirm({
      title: decision === 'REVIEWED_OK' ? 'Mark as OK' : 'Flag for follow-up',
      content: <Input.TextArea id={`review-note-${id}`} placeholder="Note (optional)" rows={3} />,
      onOk: async () => {
        const note = (document.getElementById(`review-note-${id}`) as HTMLTextAreaElement)?.value;
        await post(`/requisitions/${id}/emergency-review`, { decision, note });
        message.success('Reviewed');
        void load();
      },
    });
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><ThunderboltOutlined /> Emergency Review Queue</Space>
          </Title>
          <Text type="secondary">Requisitions that bypassed normal approval. Review post-hoc.</Text>
        </Col>
        <Col><Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button></Col>
      </Row>

      <Alert
        type="warning" showIcon style={{ marginBottom: 12 }}
        message={`${rows.length} pending review`}
        description="Use FLAG when the emergency justification seems insufficient — flagged items are audited monthly."
      />

      <Card size="small">
        <Table<Req>
          rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Req #', dataIndex: 'requisitionNumber', width: 140 },
            { title: 'Title', dataIndex: 'title', ellipsis: true },
            {
              title: 'Approved at', dataIndex: 'approvedAt', width: 170,
              render: (v) => v ? new Date(v).toLocaleString() : '—',
            },
            {
              title: 'Total', dataIndex: 'estimatedTotalUsd', width: 110, align: 'right' as const,
              render: (v) => v != null ? `$${Number(v).toFixed(2)}` : '—',
            },
            { title: 'Reason', dataIndex: 'emergencyReason', ellipsis: true },
            {
              title: 'Action', width: 200,
              render: (_, r) => (
                <Space>
                  <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => review(r.id, 'REVIEWED_OK')}>OK</Button>
                  <Button size="small" danger icon={<FlagOutlined />} onClick={() => review(r.id, 'REVIEWED_FLAG')}>Flag</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </PageWrap>
  );
};

export default EmergencyReviewQueuePage;
