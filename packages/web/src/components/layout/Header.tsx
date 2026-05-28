import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Layout,
  Button,
  Dropdown,
  Badge,
  Avatar,
  Space,
  Typography,
  Popover,
  List,
  Tag,
  Empty,
  Spin,
} from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  ProfileOutlined,
  SettingOutlined,
  BellFilled,
  QuestionCircleOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { RootState } from '../../store/store';
import { post } from '../../api/client';
import { logout } from '../../store/slices/authSlice';
import {
  setNotifications,
  setUnreadCount,
  markAllAsRead as markAllAsReadAction,
} from '../../store/slices/notificationSlice';
import { notificationsApi } from '../../api/notifications';
import styled from 'styled-components';
import TenantSwitcher from './TenantSwitcher';
import GlobalSearch from './GlobalSearch';

dayjs.extend(relativeTime);

const { Header: AntHeader } = Layout;
const { Text } = Typography;

const StyledHeader = styled(AntHeader)`
  background: #fff;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  position: sticky;
  top: 0;
  z-index: 10;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const NotifPanel = styled.div`
  width: 340px;
  max-height: 420px;
  overflow-y: auto;
`;

const NotifHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px 12px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 4px;
`;

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

const RESOURCE_COLOR: Record<string, string> = {
  ORDER: 'blue',
  INVOICE: 'green',
  CONTRACT: 'cyan',
  CHAT: 'purple',
  SYSTEM: 'default',
};

const Header: React.FC<HeaderProps> = ({ collapsed, onToggle }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const userData = useSelector((state: RootState) => state.auth.userData);
  const unreadCount = useSelector((state: RootState) => state.notification.unreadCount);
  const notifications = useSelector((state: RootState) => state.notification.notifications);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = async () => {
    try {
      const [listData, countData] = await Promise.all([
        notificationsApi.list({ limit: 20 }),
        notificationsApi.count(),
      ]);
      const items: any[] = Array.isArray(listData)
        ? listData
        : (listData?.items ?? []);
      dispatch(setNotifications(items));
      dispatch(setUnreadCount(Number(countData?.count ?? 0)));
    } catch {
      // silent — don't flood toasts on background poll
    }
  };

  // Poll every 30 s
  useEffect(() => {
    fetchNotifications();
    pollRef.current = setInterval(fetchNotifications, 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleOpenChange = async (visible: boolean) => {
    setOpen(visible);
    if (visible) {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      dispatch(markAllAsReadAction());
    } catch { /* empty */ }
  };

  const handleNotifClick = async (notif: any) => {
    if (!notif.isRead) {
      try {
        await notificationsApi.markRead(notif.id);
        // refresh
        fetchNotifications();
      } catch { /* empty */ }
    }
    setOpen(false);
    // Navigate to resource if available (DB stores redirectTo/redirectId)
    const type = notif.redirectTo ?? notif.resourceType;
    const id = notif.redirectId ?? notif.resourceId;
    if (type === 'ORDER' && id) {
      navigate(`/provider-orders/${id}`);
    } else if (type === 'INVOICE' && id) {
      navigate(`/billing-orders/${id}`);
    } else if (type === 'CONTRACT' && id) {
      navigate(`/contracts/${id}`);
    }
  };

  const notifContent = (
    <NotifPanel>
      <NotifHeader>
        <Text strong>Notifications</Text>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleMarkAllRead}
            style={{ padding: 0 }}
          >
            Mark all read
          </Button>
        )}
      </NotifHeader>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : notifications.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No notifications"
          style={{ padding: '24px 0' }}
        />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(item: any) => (
            <List.Item
              style={{
                padding: '8px 4px',
                cursor: 'pointer',
                background: item.isRead ? 'transparent' : '#f0f7ff',
                borderRadius: 6,
              }}
              onClick={() => handleNotifClick(item)}
            >
              <List.Item.Meta
                title={
                  <Space size={6}>
                    <Tag color={RESOURCE_COLOR[item.redirectTo ?? item.resourceType] ?? 'default'} style={{ margin: 0 }}>
                      {item.redirectTo ?? item.resourceType ?? 'INFO'}
                    </Tag>
                    <Text style={{ fontSize: 13 }}>{item.message}</Text>
                    {!item.isRead && <Badge dot />}
                  </Space>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {item.createdAt ? dayjs(item.createdAt).fromNow() : ''}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </NotifPanel>
  );

  const handleLogout = () => {
    // Best-effort server-side revocation of this user's refresh tokens before
    // we clear local state. Fire-and-forget — never block logout on it.
    void post('/auth/logout').catch(() => {});
    dispatch(logout());
    navigate('/login');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <ProfileOutlined />,
      label: 'Profile',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/setting'),
    },
    {
      key: 'notification-preferences',
      icon: <BellFilled />,
      label: 'Notification Preferences',
      onClick: () => navigate('/notification-preferences'),
    },
    {
      key: 'help-center',
      icon: <QuestionCircleOutlined />,
      label: 'Help Center',
      onClick: () => navigate('/help-center'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: handleLogout,
      danger: true,
    },
  ];

  return (
    <StyledHeader>
      <HeaderLeft>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
          style={{ fontSize: 16 }}
        />
      </HeaderLeft>
      <HeaderRight>
        <GlobalSearch />
        <TenantSwitcher />
        <Popover
          content={notifContent}
          trigger="click"
          open={open}
          onOpenChange={handleOpenChange}
          placement="bottomRight"
          arrow={false}
        >
          <Badge count={unreadCount} size="small">
            <Button
              type="text"
              icon={<BellOutlined style={{ fontSize: 18 }} />}
            />
          </Badge>
        </Popover>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1BAEE5' }} />
            <Text strong>{userData?.name || userData?.email}</Text>
          </Space>
        </Dropdown>
      </HeaderRight>
    </StyledHeader>
  );
};

export default Header;
