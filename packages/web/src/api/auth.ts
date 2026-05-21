import { get, post } from './client';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface MembershipSummary {
  id: string;
  tenantType: 'HOSPITAL' | 'VENDOR' | 'PROVIDER' | 'SUPER_VENDOR';
  tenantId: string;
  role: string;
  isDefault: boolean;
  label?: string;
}

export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  user?: any;
  requiresMfa?: boolean;
  mfaToken?: string;
  requiresPasswordChange?: boolean;
  changePasswordToken?: string;
  // Phase F — multi-org login picker
  requiresMembershipSelection?: boolean;
  memberships?: MembershipSummary[];
  partialToken?: string;
}

export interface MfaSetupResponse {
  secret: string;
  uri: string;
  qrCodeDataUrl: string;
}

/** Build request config with the Turnstile token in the cf-turnstile-token header. */
const withTurnstile = (token?: string) =>
  token ? { headers: { 'cf-turnstile-token': token } } : undefined;

export const authApi = {
  login: (data: LoginRequest, turnstileToken?: string) =>
    post<LoginResponse>('/auth/login', data, withTurnstile(turnstileToken)),

  verifyMfa: (data: { code: string; mfaToken: string }) =>
    post<LoginResponse>('/auth/mfa/verify', data),

  setupMfa: (data: { mfaToken: string }) =>
    post<MfaSetupResponse>('/auth/mfa/setup', data),

  forgotPassword: (data: { email: string }, turnstileToken?: string) =>
    post<{ message: string }>('/auth/forgot-password', data, withTurnstile(turnstileToken)),

  resetPassword: (
    data: { email: string; code: string; newPassword: string },
    turnstileToken?: string,
  ) => post<{ message: string }>('/auth/reset-password', data, withTurnstile(turnstileToken)),

  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
    changePasswordToken?: string;
  }) => post<LoginResponse>('/auth/change-password', data),

  refreshToken: (data: { refreshToken: string }) =>
    post<{ accessToken: string }>('/auth/refresh', data),

  // Phase F — multi-org membership endpoints
  selectMembership: (data: { membershipId: string; partialToken: string }) =>
    post<LoginResponse>('/auth/select-membership', data),

  switchMembership: (data: { membershipId: string }) =>
    post<LoginResponse>('/auth/switch-membership', data),

  myMemberships: () =>
    get<{ items: MembershipSummary[] }>('/auth/memberships'),
};
