import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Tag,
  Descriptions,
  Input,
  Avatar,
  Divider,
  message,
  Spin,
  Alert,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  CustomerServiceOutlined,
  SendOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { useSelector } from 'react-redux';
import { get, post } from '../../../api/client';
import type { RootState } from '../../../store/store';

const { Title, Text } = Typography;
const { TextArea } = Input;

const PageWrapper = styled.div`
  padding: 24px;
`;

const SectionCard = styled(Card)`
  border-radius: 12px;
  margin-bottom: 16px;
`;

const MessageThread = styled.div`
  max-height: 520px;
  overflow-y: auto;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const MessageRow = styled.div<{ $isOwn: boolean }>`
  display: flex;
  gap: 12px;
  flex-direction: ${({ $isOwn }) => ($isOwn ? 'row-reverse' : 'row')};
  align-items: flex-start;
`;

const Bubble = styled.div<{ $isOwn: boolean }>`
  max-width: 68%;
  padding: 12px 16px;
  border-radius: ${({ $isOwn }) => ($isOwn ? '16px 4px 16px 16px' : '4px 16px 16px 16px')};
  background: ${({ $isOwn }) => ($isOwn ? '#1677ff' : '#f0f0f0')};
  color: ${({ $isOwn }) => ($isOwn ? '#fff' : 'inherit')};
  word-break: break-word;
`;

const BubbleMeta = styled.div<{ $isOwn: boolean }>`
  display: flex;
  justify-content: ${({ $isOwn }) => ($isOwn ? 'flex-end' : 'flex-start')};
  gap: 8px;
  margin-bottom: 4px;
  align-items: baseline;
`;

interface SupportTicket {
  id: string;
  ticketNumber?: string;
  subject: string;
  status: string;
  priority?: string;
  createdAt: string;
  updatedAt?: string;
  createdByName?: string;
}

interface TicketMessage {
  id: string;
  senderId?: string;
  senderName?: string;
  senderRole?: string;
  body: string;
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

const SupportAndHelpDetail: React.FC = () => {
  const { supportTicketId } = useParams<{ supportTicketId: string }>();
  const navigate = useNavigate();
  const userData = useSelector((state: RootState) => state.auth.userData);

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useCallback(async () => {
    if (!supportTicketId) return;
    setTicketLoading(true);
    try {
      const data = await get<SupportTicket>(`/support-tickets/${supportTicketId}`);
      setTicket(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load ticket details.');
    } finally {
      setTicketLoading(false);
    }
  }, [supportTicketId]);

  const fetchMessages = useCallback(async () => {
    if (!supportTicketId) return;
    setMessagesLoading(true);
    try {
      const data = await get<any>(`/support-tickets/${supportTicketId}/messages`);
      setMessages(Array.isArray(data) ? data : (data?.items ?? []));
    } catch {
      // silently fail on messages
    } finally {
      setMessagesLoading(false);
    }
  }, [supportTicketId]);

  useEffect(() => {
    fetchTicket();
    fetchMessages();
  }, [fetchTicket, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendReply = async () => {
    if (!replyText.trim()) {
      message.warning('Please enter a reply message.');
      return;
    }
    setSendLoading(true);
    try {
      await post(`/support-tickets/${supportTicketId}/messages`, {
        body: replyText.trim(),
      });
      setReplyText('');
      await fetchMessages();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to send reply.');
    } finally {
      setSendLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSendReply();
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatusLoading(true);
    try {
      await post(`/support-tickets/${supportTicketId}/status`, { status: newStatus });
      setTicket((prev) => prev ? { ...prev, status: newStatus } : prev);
      message.success(`Ticket marked as ${STATUS_LABEL[newStatus] || newStatus}.`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to update status.');
    } finally {
      setStatusLoading(false);
    }
  };

  const isOwnMessage = (msg: TicketMessage) => {
    return msg.senderId === userData?.id || msg.senderRole === 'user';
  };

  const getSenderLabel = (msg: TicketMessage) => {
    if (isOwnMessage(msg)) return 'You';
    return msg.senderName || 'Support Team';
  };

  if (ticketLoading) {
    return (
      <PageWrapper>
        <div style={{ textAlign: 'center', paddingTop: 80 }}>
          <Spin size="large" />
        </div>
      </PageWrapper>
    );
  }

  if (error && !ticket) {
    return (
      <PageWrapper>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/help-and-support')}
          style={{ marginBottom: 16 }}
        >
          Back
        </Button>
        <Alert message={error} type="error" showIcon />
      </PageWrapper>
    );
  }

  const ticketStatus = ticket?.status || 'OPEN';

  return (
    <PageWrapper>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space wrap>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/help-and-support')}
              >
                Back
              </Button>
              <Title level={3} style={{ margin: 0 }}>
                {ticket?.ticketNumber
                  ? `Ticket ${ticket.ticketNumber}`
                  : `Ticket #${(supportTicketId || '').slice(0, 8).toUpperCase()}`}
              </Title>
              <Tag color={STATUS_COLOR[ticketStatus] || 'default'}>
                {STATUS_LABEL[ticketStatus] || ticketStatus}
              </Tag>
            </Space>
          </Col>
          {ticketStatus !== 'CLOSED' && (
            <Col>
              <Space>
                {ticketStatus === 'OPEN' && (
                  <Button
                    icon={<SyncOutlined />}
                    loading={statusLoading}
                    onClick={() => handleStatusChange('IN_PROGRESS')}
                  >
                    Mark In Progress
                  </Button>
                )}
                <Button
                  icon={<CheckCircleOutlined />}
                  danger
                  loading={statusLoading}
                  onClick={() => handleStatusChange('CLOSED')}
                >
                  Close Ticket
                </Button>
              </Space>
            </Col>
          )}
        </Row>

        {/* Ticket Details */}
        <SectionCard title="Ticket Details">
          {ticket ? (
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Subject">{ticket.subject}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLOR[ticketStatus] || 'default'}>
                  {STATUS_LABEL[ticketStatus] || ticketStatus}
                </Tag>
              </Descriptions.Item>
              {ticket.priority && (
                <Descriptions.Item label="Priority">
                  {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Created">
                {ticket.createdAt
                  ? dayjs(ticket.createdAt).format('MMM D, YYYY h:mm A')
                  : '—'}
              </Descriptions.Item>
              {ticket.updatedAt && (
                <Descriptions.Item label="Last Updated">
                  {dayjs(ticket.updatedAt).format('MMM D, YYYY h:mm A')}
                </Descriptions.Item>
              )}
              {ticket.createdByName && (
                <Descriptions.Item label="Submitted By">
                  {ticket.createdByName}
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <Spin />
          )}
        </SectionCard>

        {/* Conversation */}
        <SectionCard title="Conversation">
          {messagesLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              No messages yet. Be the first to reply below.
            </div>
          ) : (
            <MessageThread ref={threadRef}>
              {messages.map((msg) => {
                const own = isOwnMessage(msg);
                return (
                  <MessageRow key={msg.id} $isOwn={own}>
                    <Avatar
                      icon={own ? <UserOutlined /> : <CustomerServiceOutlined />}
                      style={{
                        background: own ? '#52c41a' : '#1677ff',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: own ? 'flex-end' : 'flex-start' }}>
                      <BubbleMeta $isOwn={own}>
                        <Text strong style={{ fontSize: 12 }}>
                          {getSenderLabel(msg)}
                        </Text>
                        <Tooltip title={dayjs(msg.createdAt).format('MMM D, YYYY h:mm:ss A')}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            <ClockCircleOutlined style={{ marginRight: 3 }} />
                            {dayjs(msg.createdAt).format('MMM D, h:mm A')}
                          </Text>
                        </Tooltip>
                      </BubbleMeta>
                      <Bubble $isOwn={own}>
                        <Text style={{ color: own ? '#fff' : 'inherit', whiteSpace: 'pre-wrap' }}>
                          {msg.body}
                        </Text>
                      </Bubble>
                    </div>
                  </MessageRow>
                );
              })}
            </MessageThread>
          )}

          {ticketStatus !== 'CLOSED' && (
            <>
              <Divider style={{ margin: '16px 0' }} />
              <Row gutter={12} align="bottom">
                <Col flex="auto">
                  <TextArea
                    rows={3}
                    placeholder="Type your reply... (Ctrl+Enter to send)"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sendLoading}
                  />
                </Col>
                <Col>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSendReply}
                    loading={sendLoading}
                    style={{ height: 76 }}
                  >
                    Send
                  </Button>
                </Col>
              </Row>
            </>
          )}

          {ticketStatus === 'CLOSED' && (
            <Alert
              message="This ticket is closed. Reopen by contacting support."
              type="info"
              showIcon
              style={{ marginTop: 16 }}
            />
          )}
        </SectionCard>
      </Space>
    </PageWrapper>
  );
};

export default SupportAndHelpDetail;
