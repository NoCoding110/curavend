import { get, post, put, del } from './client';

export const encounterApi = {
  get: (orderId: string) => get<any>(`/orders/${orderId}/encounter`),

  addItem: (orderId: string, section: 'ASSESSMENT' | 'DELIVERY', body: any) =>
    post(`/orders/${orderId}/encounter/${section}/items`, body),

  updateItem: (orderId: string, section: 'ASSESSMENT' | 'DELIVERY', itemId: string, body: any) =>
    put(`/orders/${orderId}/encounter/${section}/items/${itemId}`, body),

  deleteItem: (orderId: string, section: 'ASSESSMENT' | 'DELIVERY', itemId: string) =>
    del(`/orders/${orderId}/encounter/${section}/items/${itemId}`),

  confirmSection: (orderId: string, section: 'ASSESSMENT' | 'DELIVERY') =>
    post(`/orders/${orderId}/encounter/${section}/confirm`, {}),

  uploadPod: (
    orderId: string,
    body: {
      fileKey?: string;
      signatureDataUrl?: string;
      deliveredBy?: string;
      deliveryGuarantorName?: string;
      deliveryDateTime?: string;
      deliveryAcceptedBy?: string;
    },
  ) => post(`/orders/${orderId}/encounter/pod`, body),

  submit: (orderId: string) => post(`/orders/${orderId}/encounter/submit`, {}),

  pdfData: (orderId: string) => get<any>(`/orders/${orderId}/encounter/pdf`),
};
