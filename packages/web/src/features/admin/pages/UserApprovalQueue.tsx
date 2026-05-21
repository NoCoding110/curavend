import React, { useEffect, useState } from 'react';
import { Button, Card, Input, message, Modal, Space, Table, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { adminApi } from '../../../api/admin';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;
const PageWrapper = styled.div`padding: 24px;`;

const UserApprovalQueue: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; userId?: string }>({ open: false });
  const [reason, setReason] = useState('');

  const baseColumns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Role', dataIndex: 'role', render: (v: any) => <Tag>{v}</Tag> },
    { title: 'Type', dataIndex: 'userType', render: (v: any) => <Tag color="blue">{v}</Tag> },
    { title: 'Requested', dataIndex: 'createdAt', render: (v: any) => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_: any, r: any) => (
        <Space>
          <Button type="primary" icon={<CheckOutlined />} onClick={() => approve(r.id)}>Approve</Button>
          <Button danger icon={<CloseOutlined />} onClick={() => setRejectModal({ open: true, userId: r.id })}>Reject</Button>
        </Space>
      ),
    },
  ];
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await adminApi.pendingUsers();
      setRows(d.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load pending users');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: string) => {
    try {
      await adminApi.approveUser(id);
      message.success('User approved');
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Approval failed');
    }
  };

  const reject = async () => {
    if (!rejectModal.userId) return;
    try {
      await adminApi.rejectUser(rejectModal.userId, reason);
      message.success('User rejected');
      setRejectModal({ open: false });
      setReason('');
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Rejection failed');
    }
  };

  return (
    <PageWrapper>
      <Title level={3}>Pending User Approvals</Title>
      <Card>
        <Table
          loading={loading}
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 20 }}
          columns={columns}
          components={tableComponents}
        />
      </Card>

      <Modal
        title="Reject User"
        open={rejectModal.open}
        onCancel={() => setRejectModal({ open: false })}
        onOk={reject}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <Input.TextArea
          rows={4}
          placeholder="Reason (optional — will be emailed to user)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </PageWrapper>
  );
};

export default UserApprovalQueue;
