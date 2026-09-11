import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export type PlanThemeColor = 'default' | 'amber' | 'blue' | 'purple' | 'emerald' | 'rose' | 'indigo';
export type PlanAnimationEffect = 'none' | 'beam' | 'pulse' | 'beam_pulse';
export type PlanBeamColor = 'theme' | 'rainbow';
export type PlanBadgeVariant = 'default' | 'outline' | 'secondary' | 'glow' | 'gradient';

export interface PlanCardConfig {
  themeColor?: PlanThemeColor;
  icon?: string;
  buttonText?: string | null;
  originalPrice?: number | null;
  discountText?: string | null;
  badgeVariant?: PlanBadgeVariant;
  animationEffect?: PlanAnimationEffect;
  beamColor?: PlanBeamColor;
  shimmerButton?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  trafficLimitBytes: number;
  trafficResetMode: 'NONE' | 'CALENDAR_MONTH' | 'SUBSCRIPTION_CYCLE';
  lineMatchMode: 'ALL' | 'TAGS' | 'EXPLICIT';
  lineTags: string[];
  lineIds: string[];
  templateId: string | null;
  template?: { id: string; name: string; isDefault: boolean } | null;
  badgeText?: string | null;
  isFeatured?: boolean;
  features?: string[];
  cardConfig?: PlanCardConfig;
  isPublic: boolean;
  sortOrder: number;
}

export interface PlanPayload {
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  trafficLimitBytes: number;
  trafficResetMode: Plan['trafficResetMode'];
  lineMatchMode: Plan['lineMatchMode'];
  lineTags: string[];
  lineIds: string[];
  templateId?: string | null;
  badgeText?: string | null;
  isFeatured?: boolean;
  features?: string[];
  cardConfig?: PlanCardConfig;
  isPublic: boolean;
  sortOrder: number;
}

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => (await api.get<{ data: Plan[] }>('/admin/plans', { params: { pageSize: 100 } })).data.data
  });
}

export function usePublicPlans() {
  return useQuery({
    queryKey: ['plans', 'public'],
    queryFn: async () => (await api.get<Plan[]>('/plans/public')).data
  });
}

export function usePlanMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
    void queryClient.invalidateQueries({ queryKey: ['plans', 'public'] });
  };
  const options = {
    onSuccess: () => {
      toast.success('套餐已保存');
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '套餐操作失败'))
  };
  const create = useMutation({
    mutationFn: async (payload: PlanPayload) => (await api.post('/admin/plans', payload)).data,
    ...options
  });
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: PlanPayload & { id: string }) => (await api.patch(`/admin/plans/${id}`, payload)).data,
    ...options
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/plans/${id}`)).data,
    onSuccess: () => {
      toast.success('套餐已删除');
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '删除失败'))
  });
  return { create, update, remove };
}
