/**
 * advancedSearch — Medzah-style filter/sort/pagination DSL for Drizzle.
 *
 * Input shape (validated at the route layer):
 *   {
 *     filters: [{ field: "status", op: "eq", value: "PENDING" }, ...],
 *     sort: [{ field: "createdAt", direction: "desc" }, ...],
 *     pageNumber: 1,
 *     pageSize: 25
 *   }
 *
 * Each entity registers a whitelist of allowed fields (mapping to its
 * Drizzle columns) so attackers can't filter on internal columns or run
 * arbitrary SQL.
 */
import {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  like,
  inArray,
  isNull,
  isNotNull,
  and,
  or,
  between,
  asc,
  desc,
  SQL,
  AnyColumn,
} from 'drizzle-orm';

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'in'
  | 'between'
  | 'is_null'
  | 'is_not_null';

export interface FilterDto {
  field: string;
  op: FilterOperator;
  value?: unknown;
}

export interface SortDto {
  field: string;
  direction: 'asc' | 'desc';
}

export interface SearchInput {
  filters?: FilterDto[];
  sort?: SortDto[];
  pageNumber?: number;
  pageSize?: number;
}

export type FieldMap = Record<string, AnyColumn>;

export function buildFilterClause(
  fields: FieldMap,
  filters: FilterDto[] = [],
): SQL | undefined {
  const clauses: SQL[] = [];
  for (const filter of filters) {
    const col = fields[filter.field];
    if (!col) continue; // silently skip unknown fields (whitelisted)
    const v = filter.value;
    switch (filter.op) {
      case 'eq':
        clauses.push(eq(col, v as any));
        break;
      case 'neq':
        clauses.push(ne(col, v as any));
        break;
      case 'gt':
        clauses.push(gt(col, v as any));
        break;
      case 'gte':
        clauses.push(gte(col, v as any));
        break;
      case 'lt':
        clauses.push(lt(col, v as any));
        break;
      case 'lte':
        clauses.push(lte(col, v as any));
        break;
      case 'like':
        clauses.push(like(col, `%${String(v ?? '')}%`));
        break;
      case 'in':
        if (Array.isArray(v) && v.length > 0) clauses.push(inArray(col, v as any[]));
        break;
      case 'between':
        if (Array.isArray(v) && v.length === 2) {
          clauses.push(between(col, v[0] as any, v[1] as any));
        }
        break;
      case 'is_null':
        clauses.push(isNull(col));
        break;
      case 'is_not_null':
        clauses.push(isNotNull(col));
        break;
    }
  }
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

export function buildSortClause(fields: FieldMap, sorts: SortDto[] = []): SQL[] {
  return sorts
    .map((s) => {
      const col = fields[s.field];
      if (!col) return null;
      return s.direction === 'desc' ? desc(col) : asc(col);
    })
    .filter((x): x is SQL => x !== null);
}

export interface PagedResponse<T> {
  data: T[];
  totalElements: number;
  totalPages: number;
  pageSize: number;
  pageNumber: number;
}

export function buildPagedResponse<T>(
  rows: T[],
  total: number,
  pageNumber: number,
  pageSize: number,
): PagedResponse<T> {
  return {
    data: rows,
    totalElements: total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    pageNumber,
  };
}

export function parsePagination(
  input: SearchInput,
  defaults: { pageSize: number; maxPageSize: number } = { pageSize: 25, maxPageSize: 200 },
): { pageNumber: number; pageSize: number; offset: number } {
  const pageNumber = Math.max(1, Number(input.pageNumber ?? 1));
  const pageSize = Math.min(
    defaults.maxPageSize,
    Math.max(1, Number(input.pageSize ?? defaults.pageSize)),
  );
  return { pageNumber, pageSize, offset: (pageNumber - 1) * pageSize };
}

export { or };
