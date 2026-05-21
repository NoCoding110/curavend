// ──────────────────────────────────────────────
// API request / response types
// ──────────────────────────────────────────────

/** Generic paginated response envelope. */
export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  total: number;
}

/** Standard API error payload. */
export interface ApiError {
  message: string;
  code: string;
  statusCode: number;
}

/** JWT token set returned after authentication. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ──── Auth ────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  tokens?: AuthTokens;
  user?: Record<string, unknown>;
  requiresMfa?: boolean;
  mfaToken?: string;
  requiresPasswordChange?: boolean;
}

export interface MfaVerifyRequest {
  code: string;
  mfaToken: string;
}

export interface MfaVerifyResponse {
  tokens: AuthTokens;
  user: Record<string, unknown>;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  tokens: AuthTokens;
}

// ──── Pagination ────

export interface PaginationParams {
  nextToken?: string;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// ──── Generic wrappers ────

/** Success response wrapper used by the API. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/** List response wrapper used by the API. */
export interface ApiListResponse<T> {
  success: boolean;
  data: PaginatedResponse<T>;
  message?: string;
}
