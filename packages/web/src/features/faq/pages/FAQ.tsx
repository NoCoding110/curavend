import React from 'react';
import {
  Card,
  Typography,
  Space,
  Collapse,
  Divider,
} from 'antd';
import {
  QuestionCircleOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  InboxOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';

const { Title, Text, Paragraph } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
  max-width: 900px;
`;

const CategorySection = styled.div`
  margin-bottom: 24px;
`;

const CategoryHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

interface FAQCategory {
  title: string;
  icon: React.ReactNode;
  items: { question: string; answer: string }[];
}

const faqData: FAQCategory[] = [
  {
    title: 'General',
    icon: <QuestionCircleOutlined style={{ fontSize: 18, color: '#1890ff' }} />,
    items: [
      {
        question: 'What is CuraVend?',
        answer: 'CuraVend is a healthcare supply chain management platform that connects hospitals and medical supply vendors. It streamlines the ordering, tracking, and billing of medical supplies and equipment.',
      },
      {
        question: 'How do I get started with CuraVend?',
        answer: 'After your account is created by an administrator, you will receive a welcome email with login credentials. On first login, you will be prompted to set up multi-factor authentication and change your password.',
      },
      {
        question: 'What user roles are available?',
        answer: 'CuraVend supports multiple roles including Hospital Admin, Hospital Staff, Vendor Admin, Vendor Staff, Super Vendor Admin, and System Admin. Each role has specific permissions for accessing features and performing actions.',
      },
      {
        question: 'How do I reset my password?',
        answer: 'Click the "Forgot Password" link on the login page and enter your registered email address. You will receive a password reset link that is valid for 24 hours.',
      },
    ],
  },
  {
    title: 'Orders',
    icon: <ShoppingCartOutlined style={{ fontSize: 18, color: '#52c41a' }} />,
    items: [
      {
        question: 'How do I create a new supply order?',
        answer: 'Navigate to Supply Orders and click "Create Order." Follow the multi-step form to enter patient information, clinical details, and order items. Review and submit the order.',
      },
      {
        question: 'What are the different order statuses?',
        answer: 'Orders progress through statuses: Pending (awaiting vendor assignment), In Process (vendor assigned, confirmed, or dispensed), Completed (delivered and spend confirmed), and Cancelled.',
      },
      {
        question: 'Can I modify an order after submission?',
        answer: 'Orders can be modified while in Pending status. Once a vendor confirms the order, modifications require creating a new order or contacting the vendor through the messaging system.',
      },
      {
        question: 'How do I track my order?',
        answer: 'Open the order detail page to view the status timeline. You can also communicate with the vendor through the integrated messaging system for real-time updates.',
      },
    ],
  },
  {
    title: 'Billing',
    icon: <DollarOutlined style={{ fontSize: 18, color: '#faad14' }} />,
    items: [
      {
        question: 'How does the billing process work?',
        answer: 'After an order is delivered, the spend is confirmed, and an invoice is generated. The invoice goes through statuses: Unbilled, Spend Confirmed, Invoice Generated, Open, and Paid.',
      },
      {
        question: 'How do I download an invoice?',
        answer: 'Open the invoice detail page and click the "Download PDF" button. The invoice will be downloaded as a PDF document with all line items and payment details.',
      },
      {
        question: 'What payment methods are supported?',
        answer: 'Payment processing is handled outside of CuraVend. The platform tracks invoice status and payment records. Contact your administrator for payment method details.',
      },
    ],
  },
  {
    title: 'Inventory',
    icon: <InboxOutlined style={{ fontSize: 18, color: '#722ed1' }} />,
    items: [
      {
        question: 'How do consignment closets work?',
        answer: 'Consignment closets are vendor-owned inventory stored at hospital locations. The system tracks PAR levels, on-hand quantities, and variances. When items are dispensed from a closet, the vendor is automatically notified.',
      },
      {
        question: 'Can I upload inventory data from a spreadsheet?',
        answer: 'Yes, navigate to Inventory Management and click "Upload CSV/Excel." The system supports CSV, XLSX, and XLS file formats. A template is available for download to ensure correct formatting.',
      },
      {
        question: 'How are PAR levels managed?',
        answer: 'PAR (Periodic Automatic Replenishment) levels are set per item per consignment closet. When on-hand quantity falls below the PAR level, the system generates replenishment alerts.',
      },
    ],
  },
  {
    title: 'Technical',
    icon: <ToolOutlined style={{ fontSize: 18, color: '#eb2f96' }} />,
    items: [
      {
        question: 'What browsers are supported?',
        answer: 'CuraVend supports the latest versions of Google Chrome, Mozilla Firefox, Microsoft Edge, and Safari. For the best experience, we recommend using Google Chrome.',
      },
      {
        question: 'Is my data secure?',
        answer: 'CuraVend uses industry-standard encryption for data in transit and at rest. The platform is HIPAA compliant and implements role-based access controls, multi-factor authentication, and audit logging.',
      },
      {
        question: 'How do I enable multi-factor authentication?',
        answer: 'MFA is configured during first login. If you need to reconfigure it, go to Profile > Settings and click "Reset MFA." You will need to scan a new QR code with your authenticator app.',
      },
      {
        question: 'Who do I contact for technical support?',
        answer: 'Create a support ticket through the Support & Help page, or email support@curavend.com. For urgent issues, call our support line at (555) 000-1234 during business hours.',
      },
    ],
  },
];

const FAQ: React.FC = () => {
  return (
    <PageWrapper>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3}>Frequently Asked Questions</Title>
          <Text type="secondary">
            Find answers to common questions about using CuraVend.
          </Text>
        </div>

        {faqData.map((category, catIndex) => (
          <CategorySection key={catIndex}>
            <CategoryHeader>
              {category.icon}
              <Title level={5} style={{ margin: 0 }}>{category.title}</Title>
            </CategoryHeader>
            <Collapse
              items={category.items.map((item, itemIndex) => ({
                key: `${catIndex}-${itemIndex}`,
                label: item.question,
                children: <Paragraph>{item.answer}</Paragraph>,
              }))}
            />
          </CategorySection>
        ))}
      </Space>
    </PageWrapper>
  );
};

export default FAQ;
