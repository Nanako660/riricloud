import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage, type ApiCertificate } from '@/lib/api';

export type { ApiCertificate };

export interface ApiCertificateDetail extends ApiCertificate {
  certificatePem: string;
  privateKeyPem: string;
}

export interface CertificatePayload {
  name: string;
  certificatePem: string;
  privateKeyPem?: string;
}

export interface ParsedCertificate {
  subject: string;
  issuer: string;
  serialNumber: string;
  sans: string[];
  validFrom: string;
  validTo: string;
  status: ApiCertificate['status'];
  daysUntilExpiry: number;
  privateKeyMatched: boolean | null;
}

export function useAdminCertificates(search = '') {
  return useQuery({
    queryKey: ['admin', 'certificates', search],
    queryFn: async () => (await api.get<{ data: ApiCertificate[]; total: number }>('/admin/certificates', {
      params: { page: 1, pageSize: 100, ...(search.trim() ? { search: search.trim() } : {}) }
    })).data
  });
}

export function useCertificateDetail(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'certificates', 'detail', id],
    enabled: enabled && Boolean(id),
    queryFn: async () => (await api.get<{ certificate: ApiCertificateDetail }>(`/admin/certificates/${id}`)).data.certificate
  });
}

export function useCertificateMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'lines'] });
  };
  const onError = (error: unknown, fallback: string) => toast.error(extractErrorMessage(error, fallback));
  const parse = useMutation({
    mutationFn: async (payload: { certificatePem: string; privateKeyPem?: string }) => (await api.post<ParsedCertificate>('/admin/certificates/parse', payload)).data,
    onError: () => undefined
  });
  const create = useMutation({
    mutationFn: async (payload: CertificatePayload) => (await api.post<{ certificate: ApiCertificate }>('/admin/certificates', payload)).data,
    onSuccess: () => { toast.success('证书已添加'); invalidate(); },
    onError: (error: unknown) => onError(error, '添加证书失败')
  });
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: CertificatePayload & { id: string }) => (await api.patch<{ certificate: ApiCertificate }>(`/admin/certificates/${id}`, payload)).data,
    onSuccess: () => { toast.success('证书已保存，关联节点将自动同步'); invalidate(); },
    onError: (error: unknown) => onError(error, '保存证书失败')
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/certificates/${id}`)).data,
    onSuccess: () => { toast.success('证书已删除'); invalidate(); },
    onError: (error: unknown) => onError(error, '删除证书失败')
  });
  return { parse, create, update, remove };
}
