import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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
  fallbackCommand?: string;
  defaultMode?: InstallMode;
  nodeOsArch?: string | null;
  nodeId?: string;
}

const deployHint: Record<DeployType, Record<'posix' | 'windows', string>> = {
  native: {
    posix: '以 root 身份执行；自动拉取预编排安装脚本并注册启动 riri-agent 系统服务（Linux systemd / macOS launchd），开机自启。',
    windows: '在 CMD 或 PowerShell 中均可直接粘贴执行；或下载 .bat 脚本直接以管理员身份运行。命令会自动提权并注册 riri-agent 系统服务。'
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
  const { t } = useTranslation(['admin', 'common']);
  const [deployType, setDeployType] = useState<DeployType>('native');
  const [targetOs, setTargetOs] = useState<TargetOs>('linux');
  const [mode, setMode] = useState<InstallMode>(defaultMode);
  const [downloading, setDownloading] = useState(false);
  const [downloadingScript, setDownloadingScript] = useState(false);
  const { data: binaryInfo } = useAdminBinaryInfo();

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

  const handleDownloadInstallScript = async () => {
    if (!nodeId) return;
    const reported = nodeOsArch?.split('/')[1] ?? 'amd64';
    const platform = `${targetOs}-${reported}`;
    const format = targetOs === 'windows' ? 'bat' : 'sh';
    try {
      setDownloadingScript(true);
      const res = await api.get<Blob>(`/admin/nodes/${nodeId}/install-script`, {
        params: { platform, format },
        responseType: 'blob'
      });
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `riri-install.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('专属安装脚本已开始下载');
    } catch {
      toast.error('下载专属安装脚本失败');
    } finally {
      setDownloadingScript(false);
    }
  };

  const hint = deployType === 'docker' ? deployHint.docker.posix : deployHint[deployType][targetOs === 'windows' ? 'windows' : 'posix'];

  return (
    <div className="min-w-0 space-y-3">
      <Tabs value={deployType} onValueChange={(value) => setDeployType(value as DeployType)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="native">{t('admin:nodes.deployNative')}</TabsTrigger>
          <TabsTrigger value="portable">{t('admin:nodes.deployPortable')}</TabsTrigger>
          <TabsTrigger value="docker">{t('admin:nodes.deployDocker')}</TabsTrigger>
          <TabsTrigger value="offline">{t('admin:nodes.deployOffline')}</TabsTrigger>
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
      {deployType === 'native' && nodeId ? (
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadingScript}
            onClick={handleDownloadInstallScript}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {downloadingScript ? t('admin:nodes.downloadingScript') : t('admin:nodes.downloadScript', { name: targetOs === 'windows' ? 'riri-install.bat' : 'riri-install.sh' })}
          </Button>
        </div>
      ) : null}
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
            {downloading ? t('admin:nodes.downloadingOfflinePkg') : t('admin:nodes.downloadOfflinePkg', { os: targetOs === 'windows' ? 'Windows' : targetOs === 'macos' ? 'macOS' : 'Linux' })}
          </Button>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs">
          {deployType === 'offline' ? t('admin:nodes.offlineCmdLabel') : t('admin:nodes.installCmdLabel')}
        </Label>
        <div className="flex min-w-0 items-start gap-2">
          <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{currentCommand}</code>
          <CopyButton value={currentCommand} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {platformAvailability ? (
        platformAvailability.available ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {t('admin:nodes.masterHasBinary', { target: platformAvailability.target })}
          </p>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t('admin:nodes.masterNoBinary', { target: platformAvailability.target })}
          </p>
        )
      ) : null}
    </div>
  );
}
