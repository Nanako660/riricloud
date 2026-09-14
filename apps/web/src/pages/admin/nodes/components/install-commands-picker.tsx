import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/shared/copy-button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminBinaryInfo, type NodeInstallCommandPair, type NodeInstallCommands } from '../use-nodes';

type DeployType = 'native' | 'portable' | 'docker' | 'offline';
type TargetOs = 'linux' | 'macos' | 'windows';
type InstallMode = 'ws' | 'http';

interface InstallCommandsPickerProps {
  commands?: NodeInstallCommands | null;
  // 旧版主控响应兜底：创建结果中的 installCommand（bash / WS 模式）
  fallbackCommand?: string;
  defaultMode?: InstallMode;
  // 节点已上报的运行平台（linux/amd64 等），用于匹配主控二进制可用性
  nodeOsArch?: string | null;
  nodeId?: string;
}

const deployHint: Record<DeployType, Record<'posix' | 'windows', string>> = {
  native: {
    posix: '以 root 身份执行；命令会注册并启动 riri-agent 系统服务（Linux systemd / macOS launchd），开机自启。',
    windows: '以管理员身份运行 PowerShell 执行；命令会下载 Agent、下载 sing-box 内核并注册 riri-agent 系统服务。'
  },
  portable: {
    posix: '免安装直接运行：数据目录为 ~/.riri-cloud，Ctrl+C 停止，sing-box 内核由 Agent 自动下载，不注册开机自启服务。',
    windows: '免安装直接运行：数据目录为 %LOCALAPPDATA%\\RiriCloud，Ctrl+C 停止，sing-box 内核由 Agent 自动下载，不注册系统服务。'
  },
  docker: {
    posix: '容器以 host 网络模式与 NET_ADMIN 能力运行，数据持久化于宿主机 /var/lib/riri-agent。',
    windows: 'Docker 命令仅适用于 Linux 宿主机。'
  },
  offline: {
    posix: '下载离线包解压后以 root 身份运行 sudo sh install.sh，脚本将自动配置系统服务与内核，无需外网访问。',
    windows: '下载离线包解压后以管理员身份运行 install.bat 或 install.ps1，脚本将自动配置系统服务与内核，无需外网访问。'
  }
};

export function InstallCommandsPicker({ commands, fallbackCommand, defaultMode = 'ws', nodeOsArch, nodeId }: InstallCommandsPickerProps) {
  const [deployType, setDeployType] = useState<DeployType>('native');
  const [targetOs, setTargetOs] = useState<TargetOs>('linux');
  const [mode, setMode] = useState<InstallMode>(defaultMode);
  const [downloading, setDownloading] = useState(false);
  const { data: binaryInfo } = useAdminBinaryInfo();

  // 平台可用性：节点上报架构仅在 OS 匹配时复用（与服务端 resolveTargetPlatform 口径一致），否则回退 amd64
  const platformAvailability = useMemo(() => {
    if (deployType === 'docker') return null;
    const reported = nodeOsArch?.split('/')[1];
    const arch = reported ?? 'amd64';
    const target = `agent-${targetOs}-${arch}`;
    const info = binaryInfo?.targets.find((item) => item.target === target);
    if (!info) return null;
    return { target, available: info.available };
  }, [binaryInfo, deployType, targetOs, nodeOsArch]);

  const currentCommand = useMemo(() => {
    if (deployType === 'offline') {
      if (targetOs === 'windows') {
        return commands?.offline?.windows ?? '';
      }
      return commands?.offline?.linux ?? '';
    }
    if (!commands) return fallbackCommand ?? '';
    if (deployType === 'docker') {
      return (mode === 'http' ? commands.dockerHttp : commands.dockerWs) ?? '';
    }
    const group = deployType === 'native' ? commands.native : commands.portable;
    const pair: NodeInstallCommandPair | undefined = group?.[targetOs];
    const legacy = mode === 'http' ? commands.http : commands.ws;
    return pair?.[mode] ?? legacy ?? fallbackCommand ?? '';
  }, [commands, fallbackCommand, deployType, targetOs, mode]);

  const handleDownloadOffline = async () => {
    if (!nodeId) return;
    const reported = nodeOsArch?.split('/')[1] ?? 'amd64';
    const platform = `${targetOs}-${reported}`;
    try {
      setDownloading(true);
      const res = await api.get<Blob>(`/admin/nodes/${nodeId}/offline-package`, {
        params: { platform },
        responseType: 'blob'
      });
      const ext = targetOs === 'windows' ? 'zip' : 'tar.gz';
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `riri-agent-offline-${platform}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('离线安装包已开始下载');
    } catch {
      toast.error('下载离线安装包失败');
    } finally {
      setDownloading(false);
    }
  };

  const hint = deployType === 'docker' ? deployHint.docker.posix : deployHint[deployType][targetOs === 'windows' ? 'windows' : 'posix'];

  return (
    <div className="min-w-0 space-y-3">
      <Tabs value={deployType} onValueChange={(value) => setDeployType(value as DeployType)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="native">原生安装</TabsTrigger>
          <TabsTrigger value="portable">免安装运行</TabsTrigger>
          <TabsTrigger value="docker">Docker</TabsTrigger>
          <TabsTrigger value="offline">离线安装包</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        {deployType !== 'docker' ? (
          <Select value={targetOs} onValueChange={(value) => setTargetOs(value as TargetOs)}>
            <SelectTrigger className="w-32" aria-label="目标操作系统"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="linux">Linux</SelectItem>
              <SelectItem value="macos">macOS</SelectItem>
              <SelectItem value="windows">Windows</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        {deployType !== 'docker' && deployType !== 'offline' ? (
          <Tabs value={mode} onValueChange={(value) => setMode(value as InstallMode)} className="min-w-0 flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ws">WS / WSS</TabsTrigger>
              <TabsTrigger value="http">HTTP / HTTPS 轮询</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>
      {deployType === 'offline' && nodeId ? (
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            disabled={downloading}
            onClick={handleDownloadOffline}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {downloading ? '正在打包下载...' : `下载 ${targetOs === 'windows' ? 'Windows' : targetOs === 'macos' ? 'macOS' : 'Linux'} 离线安装包`}
          </Button>
          <span className="text-xs text-muted-foreground">由主控打包预填配置与安装脚本（.zip / .tar.gz）</span>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs">{deployType === 'offline' ? '终端一键获取与离线安装命令' : '安装命令'}</Label>
        <div className="flex min-w-0 items-start gap-2">
          <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{currentCommand}</code>
          <CopyButton value={currentCommand} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint} 安装命令会在终端中隐藏提示输入 AgentToken。</p>
      {platformAvailability ? (
        platformAvailability.available ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">主控已内置 {platformAvailability.target} 二进制，可直接从主控下载安装。</p>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400">主控未内置 {platformAvailability.target} 二进制，原生安装将由脚本自动从 GitHub Release（或加速镜像）下载；免安装模式请先自行获取二进制。</p>
        )
      ) : null}
    </div>
  );
}
