import { get, post } from './client';

export type PriceSource = 'CONTRACT' | 'MEDICARE' | null;

export interface PriceResult {
  hcpcCode: string;
  rate: number | null;
  source: PriceSource;
  contractId: string | null;
  currency: string;
  asOf: string;
}

export const pricingApi = {
  rate: (params: { hospitalId: string; vendorId: string; hcpcCode: string; asOf?: string }) =>
    get<PriceResult>('/pricing/rate', params),
  rates: (data: { hospitalId: string; vendorId: string; hcpcCodes: string[]; asOf?: string }) =>
    post<{ rates: Record<string, Omit<PriceResult, 'hcpcCode' | 'asOf'> & { asOf?: string }>; asOf: string }>(
      '/pricing/rates/bulk',
      data,
    ),
};
