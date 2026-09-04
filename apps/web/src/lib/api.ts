import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';

// 统一 API 客户端：组件内禁止裸 fetch/自建 axios 实例（CODE_REVIEW W1）
export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15_000
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status;
    const message = error.response?.data?.message ?? '请求失败，请稍后重试';
    // 401：登录态失效，清理并跳转登录页（避免在登录页自身弹跳转循环）
    if (status === 401 && useAuthStore.getState().token) {
      useAuthStore.getState().logout();
      toast.error('登录已过期，请重新登录');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    } else if (status && status >= 500) {
      toast.error(message);
    }
    return Promise.reject(error);
  }
);

// 统一错误消息提取（表单与 mutation 复用）
export function extractErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 413) return '请求内容过大，请减少提交内容后重试';
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}

export type LineType = 'DIRECT' | 'RELAY';
export type RelayMode = 'BLIND_FORWARD' | 'PROTOCOL_PROXY' | 'TARGET_LINE';
export type LineStatus = 'ACTIVE' | 'DISABLED';
export type ProtocolType = 'VLESS' | 'VMESS' | 'TROJAN' | 'HYSTERIA2' | 'TUIC' | 'SHADOWSOCKS' | 'NAIVE' | 'SHADOWTLS' | 'MIXED' | 'SOCKS' | 'HTTP' | 'DIRECT';

export interface ApiLine {
  id: string;
  name: string;
  tag: string | null;
  listen: string;
  type: LineType;
  relayMode: RelayMode | null;
  targetLineId: string | null;
  protocolType: ProtocolType;
  params: Record<string, unknown>;
  entryNodeId: string;
  entryPort: number;
  landingNodeId?: string | null;
  landingPort?: number | null;
  certificateId: string | null;
  endpointOverrideEnabled: boolean;
  serverHost: string;
  serverPort: number;
  serverName: string | null;
  host: string | null;
  endpointOverrides: {
    serverHost: string | null;
    serverPort: number | null;
    serverName: string | null;
    host: string | null;
  };
  trafficRate: number;
  tags: string[];
  level: number;
  sortOrder: number;
  isPublic: boolean;
  status: LineStatus;
  lastLatencyMs?: number | null;
  lastTestedAt?: string | null;
  lastTestStatus?: 'SUCCESS' | 'TIMEOUT' | 'ERROR' | null;
  lastTestMessage?: string | null;
  entryNode: { id: string; name: string; serverHost: string; status: string; isLocal: boolean };
  landingNode?: { id: string; name: string; serverHost: string; status: string; isLocal: boolean } | null;
  targetLine?: {
    id: string;
    name: string;
    type: LineType;
    protocolType: ProtocolType;
    status: LineStatus;
    entryNodeId: string;
    entryPort: number;
    landingNodeId?: string | null;
    landingPort?: number | null;
    entryNode: { id: string; name: string; serverHost: string; status: string; isLocal: boolean };
  } | null;
  certificate: {
    id: string;
    name: string;
    subject: string;
    issuer: string;
    sans: string[];
    validFrom: string;
    validTo: string;
  } | null;
  topology: {
    entry: { node: { id: string; name: string; serverHost: string; status: string; isLocal: boolean }; port: number };
    landing?: { node: { id: string; name: string; serverHost: string; status: string; isLocal: boolean }; port: number } | null;
  };
}

export type CertificateStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NOT_YET_VALID';

export interface ApiCertificate {
  id: string;
  name: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  sans: string[];
  validFrom: string;
  validTo: string;
  status: CertificateStatus;
  daysUntilExpiry: number;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}
