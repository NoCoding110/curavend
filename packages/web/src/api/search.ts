import { post } from './client';

export type SearchEntityType = 'orders' | 'skus' | 'contracts';

export interface SearchResultGroup<T = any> {
  type: SearchEntityType;
  results: T[];
  total: number;
}

export interface SearchResponse {
  q: string;
  groups: SearchResultGroup[];
  total: number;
}

export const searchApi = {
  // POST keeps the search term (which may be a patient name / PHI) out of the
  // URL query string, so it never lands in access logs, history, or referrers.
  query: (q: string, types?: SearchEntityType[], limit: number = 20) =>
    post<SearchResponse>('/search', {
      q,
      types: types?.join(','),
      limit,
    }),
};
