import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Table,
  Tag,
  Tabs,
  Modal,
  Form,
  Input,
  Select,
  message,
  Alert,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { get, post } from '../../../api/client';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const PageWrapper = styled.div`
  padding: 24px;
`;

interface SupportTicket {
  id: string;
  ticketNumber?: string;
  subject: string;
  status: 'OPEN' | 'CLOSED' | 'IN_PROGRESS' | string;
  priority?: string;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'orange',
  IN_PROGRESS: 'blue',
  CLOSED: 'green',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  CLOSED: 'Closed',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  critical: 'red',
};

const TAB_ITEMS = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'CLOSED', label: 'Closed' },
];

const SupportAndHelp: React.FC = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('ALL');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<any>('/support-tickets');
      setTickets(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const filteredTickets =
    activeTab === 'ALL'
      ? tickets
      : tickets.filter((t) => t.status === activeTab);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setSubmitLoading(true);
      await post('/support-tickets', {
        subject: values.subject,
        description: values.description,
      });
      message.success('Support ticket created successfully.');
      setCreateModalOpen(false);
      createForm.resetFields();
      fetchTickets();
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.message || 'Failed to create ticket.');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const baseColumns: ColumnsType<SupportTicket> = [
    {
      title: 'Ticket #',
      dataIndex: 'ticketNumber',
      key: 'ticketNumber',
      width: 130,
      render: (text: string, record: SupportTicket) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => navigate(`/help-and-support/${record.id}`)}
        >
          {text || `#${record.id.slice(0, 8).toUpperCase()}`}
        </Button>
      ),
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => (
        <Tag color={STATUS_COLOR[status] || 'default'}>
          {STATUS_LABEL[status] || status}
        </Tag>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority: string) =>
        priority ? (
          <Tag color={PRIORITY_COLOR[priority?.toLowerCase()] || 'default'}>
            {priority.charAt(0).toUpperCase() + priority.slice(1)}
          </Tag>
        ) : (
          <span style={{ color: '#bbb' }}>—</span>
        ),
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      sorter: (a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
      render: (date: string) =>
        date ? dayjs(date).format('MMM D, YYYY h:mm A') : '—',
    },
  ];

  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <QuestionCircleOutlined style={{ fontSize: 24 }} />
            <Title level={3} style={{ margin: 0 }}>
              Support & Help
            </Title>
          </Space>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            Create Ticket
          </Button>
        </Col>
      </Row>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setError(null)}
        />
      )}

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={TAB_ITEMS.map((t) => ({
                ...t,
                label: (
                  <span>
                    {t.label}
                    {t.key !== 'ALL' && (
                      <Tag
                        style={{ marginLeft: 6 }}
                        color={STATUS_COLOR[t.key]}
                      >
                        {tickets.filter((ticket) => ticket.status === t.key).length}
                      </Tag>
                    )}
                  </span>
                ),
              }))}
            />
            <Table
              columns={columns}
              components={tableComponents}
              dataSource={filteredTickets}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: true }}
              size="middle"
              onRow={(record) => ({
                onClick: () => navigate(`/help-and-support/${record.id}`),
                style: { cursor: 'pointer' },
              })}
              locale={{ emptyText: 'No support tickets found.' }}
            />
          </>
        )}
      </Card>

      <Modal
        title="Create Support Ticket"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        okText="Submit Ticket"
        confirmLoading={submitLoading}
        width={560}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="subject"
            label="Subject"
            rules={[{ required: true, message: 'Please enter a subject' }]}
          >
            <Input placeholder="Brief description of your issue" maxLength={200} showCount />
          </Form.Item>
          <Form.Item
            name="priority"
            label="Priority"
          >
            <Select placeholder="Select priority (optional)" allowClear>
              <Option value="low">Low</Option>
              <Option value="medium">Medium</Option>
              <Option value="high">High</Option>
              <Option value="critical">Critical</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Please describe your issue' }]}
          >
            <TextArea
              rows={5}
              placeholder="Describe your issue in detail..."
              maxLength={2000}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default SupportAndHelp;
