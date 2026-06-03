import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Input,
  Badge,
  Avatar,
  Tag,
  Spin,
  Modal,
  Select,
  message as antMessage,
} from 'antd';
import {
  SearchOutlined,
  SendOutlined,
  UserOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { roomsApi } from '../../../api/rooms';
import { get } from '../../../api/client';
import type { RootState } from '../../../store/store';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
  height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
`;

const ChatContainer = styled(Card)`
  height: 100%;
  border-radius: 12px;
  .ant-card-body {
    padding: 0;
    height: 100%;
    display: flex;
  }
`;

const RoomList = styled.div`
  width: 320px;
  min-width: 320px;
  border-right: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const RoomSearch = styled.div`
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
`;

const RoomItems = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const RoomItem = styled.div<{ $active: boolean }>`
  padding: 12px 16px;
  cursor: pointer;
  background: ${(props) => (props.$active ? '#e6f7ff' : 'transparent')};
  border-bottom: 1px solid #f5f5f5;
  &:hover {
    background: ${(props) => (props.$active ? '#e6f7ff' : '#fafafa')};
  }
`;

const EmptyRooms = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #999;
  font-size: 14px;
`;

const ChatPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
`;

const ChatHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
`;

const MessageBubble = styled.div<{ $isOwn: boolean }>`
  display: flex;
  justify-content: ${(props) => (props.$isOwn ? 'flex-end' : 'flex-start')};
  margin-bottom: 12px;
`;

const Bubble = styled.div<{ $isOwn: boolean }>`
  max-width: 65%;
  min-width: 64px;
  padding: 10px 14px;
  border-radius: 12px;
  background: ${(props) => (props.$isOwn ? '#1890ff' : '#f0f0f0')};
  color: ${(props) => (props.$isOwn ? '#fff' : '#000')};
  word-break: break-word;
`;

const ChatInputWrapper = styled.div`
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-shrink: 0;
`;

const NoChatSelected = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #999;
  font-size: 16px;
`;

interface ChatRoom {
  id: string;
  name: string;
  orderId: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  roomId: string;
  senderName: string;
  senderId: string;
  content: string;
  createdAt: string;
}

const WS_BASE = 'wss://curavend-api.metabilityllc1.workers.dev';

const Message: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.userData);
  const authToken = useSelector((state: RootState) => state.auth.token) ?? '';

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const [roomSearch, setRoomSearch] = useState('');

  // New conversation modal
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [orderOptions, setOrderOptions] = useState<{ label: string; value: string; hospitalId: string; vendorId: string }[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  const messageEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsReconnectAttempts = useRef(0);
  const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch rooms ────────────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const data = await roomsApi.list();
      const raw: any[] = Array.isArray(data) ? data : (data?.items ?? data?.data ?? data?.rooms ?? []);

      const mapped: ChatRoom[] = raw
        .map((r: any) => ({
          id: r.id ?? r._id,
          name: r.displayName ?? r.name ?? r.title ?? r.orderId ?? r.id,
          orderId: r.orderId ?? r.order?.id ?? '',
          lastMessage: r.lastMessage?.content ?? r.lastMessagePreview ?? '',
          updatedAt: r.updatedAt ?? r.lastMessage?.createdAt ?? '',
          unreadCount: Number(r.unreadCount ?? 0),
        }))
        .sort((a, b) => dayjs(b.updatedAt).unix() - dayjs(a.updatedAt).unix());

      setRooms(mapped);

      // Auto-select first room
      if (mapped.length > 0 && !activeRoomId) {
        setActiveRoomId(mapped[0].id);
      }
    } catch (err: any) {
      antMessage.error(err?.response?.data?.message ?? 'Failed to load conversations.');
    } finally {
      setRoomsLoading(false);
    }
  }, [activeRoomId]);

  // ── Fetch messages for current room ───────────────────────────
  const fetchMessages = useCallback(
    async (roomId: string, silent = false) => {
      if (!silent) setMessagesLoading(true);
      try {
        const data = await roomsApi.getMessages(roomId);
        const raw: any[] = Array.isArray(data) ? data : (data?.items ?? data?.data ?? data?.messages ?? []);

        const mapped: ChatMessage[] = raw.map((m: any) => ({
          id: m.id ?? m._id,
          roomId,
          senderName: m.senderName ?? m.sender?.name ?? m.user?.name ?? 'Unknown',
          senderId: m.senderId ?? m.sender?.id ?? m.userId ?? '',
          content: m.content ?? m.text ?? m.body ?? '',
          createdAt: m.createdAt ?? '',
        }));

        setMessages(mapped);
      } catch {
        // silent poll failures — avoid toast flood
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [],
  );

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    fetchRooms();
  }, []);

  // ── WebSocket connection per room (with exponential backoff) ────
  const MAX_RECONNECT_ATTEMPTS = 8;
  const BASE_BACKOFF_MS = 1000; // 1 s → 2 → 4 → 8 → 16 → 32 → 64 → 128 s

  const connectWs = useCallback((roomId: string) => {
    // Clear any pending reconnect timer when explicitly connecting
    if (wsReconnectTimer.current) { clearTimeout(wsReconnectTimer.current); wsReconnectTimer.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    const url = `${WS_BASE}/api/rooms/${roomId}/ws?token=${encodeURIComponent(authToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      wsReconnectAttempts.current = 0; // reset on successful connection
      // Cancel polling fallback if WS reconnected
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    ws.onclose = (evt) => {
      setWsConnected(false);
      wsRef.current = null;

      const attempt = wsReconnectAttempts.current;
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        // Exponential backoff: 1s, 2s, 4s … up to 128s, with ±20% jitter
        const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), 128_000);
        const jitter = delay * 0.2 * (Math.random() - 0.5);
        const retryMs = Math.round(delay + jitter);
        wsReconnectAttempts.current += 1;
        console.log(`[ws] Closed (code=${evt.code}). Reconnecting in ${retryMs}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        wsReconnectTimer.current = setTimeout(() => connectWs(roomId), retryMs);
      } else {
        console.warn('[ws] Max reconnect attempts reached — falling back to polling');
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => fetchMessages(roomId, true), 5000);
      }
    };

    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'message' || data.content) {
          const msg: ChatMessage = {
            id: data.id ?? crypto.randomUUID(),
            roomId,
            senderName: data.senderName ?? data.sender?.name ?? 'Unknown',
            senderId: data.senderId ?? data.sender?.id ?? '',
            content: data.content ?? data.text ?? '',
            createdAt: data.createdAt ?? new Date().toISOString(),
          };
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setRooms((prev) =>
            prev.map((r) =>
              r.id === roomId ? { ...r, lastMessage: msg.content, updatedAt: msg.createdAt } : r,
            ),
          );
        }
      } catch { /* ignore non-JSON frames */ }
    };
  }, [fetchMessages, authToken]);

  // ── Load messages when room changes ───────────────────────────
  useEffect(() => {
    if (!activeRoomId) return;

    // Clear fallback polling
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    fetchMessages(activeRoomId);

    // Mark room as read
    roomsApi.markRead(activeRoomId).catch(() => {});

    // Update unread count locally
    setRooms((prev) =>
      prev.map((r) => (r.id === activeRoomId ? { ...r, unreadCount: 0 } : r)),
    );

    // Open WebSocket for this room
    connectWs(activeRoomId);

    return () => {
      if (wsReconnectTimer.current) { clearTimeout(wsReconnectTimer.current); wsReconnectTimer.current = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      wsReconnectAttempts.current = 0;
    };
  }, [activeRoomId, fetchMessages, connectWs]);

  // ── Auto-scroll ────────────────────────────────────────────────
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ───────────────────────────────────────────────
  const handleSend = async () => {
    if (!newMessage.trim() || !activeRoomId) return;
    const text = newMessage.trim();
    setNewMessage('');
    setSendingMessage(true);
    try {
      await roomsApi.sendMessage(activeRoomId, { content: text });
      // Refresh messages and rooms after sending
      await fetchMessages(activeRoomId);
      fetchRooms();
    } catch (err: any) {
      antMessage.error(err?.response?.data?.message ?? 'Failed to send message.');
      setNewMessage(text);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── New conversation ───────────────────────────────────────────
  const openNewChat = async () => {
    setNewChatOpen(true);
    setSelectedOrderId(null);
    setOrdersLoading(true);
    try {
      const data = await get<any>('/orders', { limit: 100 });
      const raw: any[] = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
      // Only show orders that have both hospital and vendor assigned
      const opts = raw
        .filter((o: any) => o.hospitalId && o.vendorId)
        .map((o: any) => ({
          label: `${o.identifier} — ${o.patientName ?? ''} (${o.orderSubStatus ?? o.status})`,
          value: o.id,
          hospitalId: o.hospitalId,
          vendorId: o.vendorId,
        }));
      setOrderOptions(opts);
    } catch {
      antMessage.error('Failed to load orders');
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!selectedOrderId) return;
    const order = orderOptions.find((o) => o.value === selectedOrderId);
    if (!order) return;
    setCreatingRoom(true);
    try {
      const room = await roomsApi.create({
        orderId: order.value,
        hospitalId: order.hospitalId,
        vendorId: order.vendorId,
      });
      setNewChatOpen(false);
      await fetchRooms();
      setActiveRoomId(room.id);
    } catch (err: any) {
      antMessage.error(err?.response?.data?.error ?? 'Failed to create conversation');
    } finally {
      setCreatingRoom(false);
    }
  };

  // ── Filtered rooms ─────────────────────────────────────────────
  const filteredRooms = useMemo(() => {
    if (!roomSearch.trim()) return rooms;
    const lower = roomSearch.toLowerCase();
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) ||
        r.orderId.toLowerCase().includes(lower),
    );
  }, [rooms, roomSearch]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  return (
    <PageWrapper>
      <Title level={3} style={{ margin: '0 0 16px 0' }}>Chat</Title>
      <ChatContainer>
        {/* Left panel: Room list */}
        <RoomList>
          <RoomSearch>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              block
              style={{ marginBottom: 10 }}
              onClick={openNewChat}
            >
              New Conversation
            </Button>
            <Input
              placeholder="Search conversations..."
              prefix={<SearchOutlined />}
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              allowClear
            />
          </RoomSearch>

          <RoomItems>
            {roomsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
                <Spin />
              </div>
            ) : filteredRooms.length === 0 ? (
              <EmptyRooms>No conversations found</EmptyRooms>
            ) : (
              filteredRooms.map((room) => (
                <RoomItem
                  key={room.id}
                  $active={room.id === activeRoomId}
                  onClick={() => setActiveRoomId(room.id)}
                >
                  <Row justify="space-between" align="top" wrap={false}>
                    <Col flex="auto" style={{ minWidth: 0 }}>
                      <Space align="start" size={8}>
                        <Avatar size="small" icon={<UserOutlined />} />
                        <div style={{ minWidth: 0 }}>
                          <Text
                            strong
                            ellipsis
                            style={{ display: 'block', maxWidth: 180 }}
                          >
                            {room.name}
                          </Text>
                          <Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                            ellipsis
                          >
                            {room.lastMessage || 'No messages yet'}
                          </Text>
                        </div>
                      </Space>
                    </Col>
                    <Col flex="none">
                      <Space direction="vertical" align="end" size={4}>
                        <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                          {room.updatedAt ? dayjs(room.updatedAt).format('HH:mm') : ''}
                        </Text>
                        {room.unreadCount > 0 && (
                          <Badge count={room.unreadCount} size="small" />
                        )}
                      </Space>
                    </Col>
                  </Row>
                </RoomItem>
              ))
            )}
          </RoomItems>
        </RoomList>

        {/* Right panel: Chat */}
        <ChatPanel>
          {!activeRoomId ? (
            <NoChatSelected>Select a conversation to start chatting</NoChatSelected>
          ) : (
            <>
              <ChatHeader>
                <Space>
                  <Avatar icon={<UserOutlined />} />
                  <div>
                    <Text strong>{activeRoom?.name ?? 'Conversation'}</Text>
                    {activeRoom?.orderId && (
                      <>
                        <br />
                        <Tag color="blue" style={{ marginTop: 4 }}>
                          {activeRoom.orderId}
                        </Tag>
                      </>
                    )}
                  </div>
                  <Tag color={wsConnected ? 'green' : 'default'} style={{ marginLeft: 8 }}>
                    {wsConnected ? 'Live' : 'Connecting…'}
                  </Tag>
                </Space>
              </ChatHeader>

              <MessageList>
                {messagesLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 32 }}>
                    <Spin />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>
                    No messages yet. Say hello!
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.senderId === currentUser?.id;
                    return (
                      <MessageBubble key={msg.id} $isOwn={isOwn}>
                        <div style={{ maxWidth: '70%' }}>
                          {!isOwn && (
                            <Text
                              type="secondary"
                              style={{
                                fontSize: 11,
                                marginBottom: 2,
                                display: 'block',
                              }}
                            >
                              {msg.senderName}
                            </Text>
                          )}
                          <Bubble $isOwn={isOwn}>
                            <Text style={{ color: isOwn ? '#fff' : undefined }}>
                              {msg.content}
                            </Text>
                          </Bubble>
                          <Text
                            type="secondary"
                            style={{
                              fontSize: 10,
                              marginTop: 2,
                              display: 'block',
                              textAlign: isOwn ? 'right' : 'left',
                            }}
                          >
                            {msg.createdAt
                              ? dayjs(msg.createdAt).format('HH:mm')
                              : ''}
                          </Text>
                        </div>
                      </MessageBubble>
                    );
                  })
                )}
                <div ref={messageEndRef} />
              </MessageList>

              <ChatInputWrapper>
                <Input.TextArea
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  style={{ flex: 1 }}
                  disabled={sendingMessage}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSend}
                  loading={sendingMessage}
                  disabled={!newMessage.trim()}
                >
                  Send
                </Button>
              </ChatInputWrapper>
            </>
          )}
        </ChatPanel>
      </ChatContainer>
      <Modal
        title="New Conversation"
        open={newChatOpen}
        onCancel={() => setNewChatOpen(false)}
        onOk={handleCreateRoom}
        okText="Start Chat"
        confirmLoading={creatingRoom}
        okButtonProps={{ disabled: !selectedOrderId }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          Select an order to open a chat between the hospital and vendor.
        </p>
        <Select
          showSearch
          placeholder="Search by order ID or patient name..."
          style={{ width: '100%' }}
          loading={ordersLoading}
          options={orderOptions}
          value={selectedOrderId}
          onChange={(v) => setSelectedOrderId(v)}
          filterOption={(input, option) =>
            (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
          }
          notFoundContent={ordersLoading ? <Spin size="small" /> : 'No orders with a vendor assigned'}
        />
      </Modal>
    </PageWrapper>
  );
};

export default Message;
