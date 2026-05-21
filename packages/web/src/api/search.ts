import { get } from './client';

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
  query: (q: string, types?: SearchEntityType[], limit: number = 20) =>
    get<SearchResponse>('/search', {
      q,
      types: types?.join(','),
      limit,
    }),
};
