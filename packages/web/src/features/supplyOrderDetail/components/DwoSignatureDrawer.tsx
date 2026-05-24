/**
 * DWO e-signature drawer.
 *
 * Physicians (or anyone authorized) draw their signature on a canvas; we
 * convert to PNG data URL and POST to /api/dme-documents/extension/:orderId/dwo-sign.
 * The server stores in R2 and stamps the order's DME extension with the
 * signature blob key + signed-at + signed-by. The DWO PDF generator embeds
 * the image at render time.
 */
import React, { useRef, useState } from 'react';
import { Button, Drawer, Form, Input, Space, message, Alert, Typography } from 'antd';
import { SignatureOutlined, DeleteOutlined } from '@ant-design/icons';
import SignatureCanvas from 'react-signature-canvas';
import { post } from '../../../api/client';

const { Text } = Typography;

interface Props {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onSigned?: () => void;
}

export const DwoSignatureDrawer: React.FC<Props> = ({ orderId, open, onClose, onSigned }) => {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const clear = () => sigRef.current?.clear();

  const submit = async () => {
    try {
      const v = await form.validateFields();
      if (!sigRef.current || sigRef.current.isEmpty()) {
        message.warning('Please sign in the box');
        return;
      }
      const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png');
      setSubmitting(true);
      await post(`/dme-documents/extension/${orderId}/dwo-sign`, {
        dataUrl,
        signedByName: v.signedByName,
        signedByNpi: v.signedByNpi,
      });
      message.success('Signature saved — DWO PDF will include it');
      onSigned?.();
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed to save signature');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={<Space><SignatureOutlined /> Sign DWO</Space>}
      open={open}
      onClose={onClose}
      width={520}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={submitting} onClick={submit}>Save signature</Button>
        </Space>
      }
    >
      <Alert
        type="info"
        message="By signing, you certify that the items on the DWO are medically necessary for this patient."
        style={{ marginBottom: 12 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item name="signedByName" label="Signed by (full name)" rules={[{ required: true }]}>
          <Input placeholder="e.g. Dr. Jane Smith, MD" />
        </Form.Item>
        <Form.Item name="signedByNpi" label="NPI">
          <Input placeholder="10-digit NPI" />
        </Form.Item>
        <Form.Item label="Signature">
          <div style={{ border: '1px dashed #ccc', borderRadius: 6, background: '#fafafa' }}>
            <SignatureCanvas
              ref={(r) => (sigRef.current = r)}
              penColor="#1f1f1f"
              canvasProps={{ width: 460, height: 160, style: { width: '100%', height: 160 } }}
            />
          </div>
          <Button size="small" type="text" icon={<DeleteOutlined />} onClick={clear} style={{ marginTop: 4 }}>
            Clear
          </Button>
        </Form.Item>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Signature is stored encrypted in R2. The image embeds into the DWO PDF; original signature
          file is auditable via the file-access log.
        </Text>
      </Form>
    </Drawer>
  );
};

export default DwoSignatureDrawer;
