import { get, post, put, del } from './client';

export interface FilterPreset {
  id: string;
  userId: string;
  entity: string;
  name: string;
  filters: Record<string, any>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavePresetInput {
  entity: string;
  name: string;
  filters: Record<string, any>;
  isDefault?: boolean;
}

export interface UpdatePresetInput {
  name?: string;
  filters?: Record<string, any>;
  isDefault?: boolean;
}

export const filterPresetsApi = {
  list: async (entity: string): Promise<FilterPreset[]> => {
    const data = await get<any>('/user-filter-presets', { entity });
    return (data?.items ?? []) as FilterPreset[];
  },
  create: (input: SavePresetInput): Promise<FilterPreset> =>
    post<FilterPreset>('/user-filter-presets', input),
  update: (id: string, input: UpdatePresetInput): Promise<FilterPreset> =>
    put<FilterPreset>(`/user-filter-presets/${id}`, input),
  remove: (id: string): Promise<{ success: boolean }> =>
    del<{ success: boolean }>(`/user-filter-presets/${id}`),
};
