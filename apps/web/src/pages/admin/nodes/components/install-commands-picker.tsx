import { useMemo, useState } from 'react';
import { CopyButton } from '@/components/shared/copy-button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { NodeInstallCommandPair, NodeInstallCommands } from '../use-nodes';

type DeployType = 'native' | 'portable' | 'docker';
type TargetOs = 'linux' | 'macos' | 'windows';
type InstallMode = 'ws' | 'http';

interface InstallCommandsPickerProps {
  commands?: NodeInstallCommands | null;
  // 旧版主控响应兜底：创建结果中的 installCommand（bash / WS 模式）
  fallbackCommand?: string;
  defaultMode?: InstallMode;
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
  }
};

export function InstallCommandsPicker({ commands, fallbackCommand, defaultMode = 'ws' }: InstallCommandsPickerProps) {
  const [deployType, setDeployType] = useState<DeployType>('native');
  const [targetOs, setTargetOs] = useState<TargetOs>('linux');
  const [mode, setMode] = useState<InstallMode>(defaultMode);

  const currentCommand = useMemo(() => {
    if (!commands) return fallbackCommand ?? '';
    if (deployType === 'docker') {
      return (mode === 'http' ? commands.dockerHttp : commands.dockerWs) ?? '';
    }
    const group = deployType === 'native' ? commands.native : commands.portable;
    const pair: NodeInstallCommandPair | undefined = group?.[targetOs];
    const legacy = mode === 'http' ? commands.http : commands.ws;
    return pair?.[mode] ?? legacy ?? fallbackCommand ?? '';
  }, [commands, fallbackCommand, deployType, targetOs, mode]);

  const hint = deployType === 'docker' ? deployHint.docker.posix : deployHint[deployType][targetOs === 'windows' ? 'windows' : 'posix'];

  return (
    <div className="min-w-0 space-y-3">
      <Tabs value={deployType} onValueChange={(value) => setDeployType(value as DeployType)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="native">原生安装</TabsTrigger>
          <TabsTrigger value="portable">免安装运行</TabsTrigger>
          <TabsTrigger value="docker">Docker</TabsTrigger>
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
        <Tabs value={mode} onValueChange={(value) => setMode(value as InstallMode)} className="min-w-0 flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ws">WS / WSS</TabsTrigger>
            <TabsTrigger value="http">HTTP / HTTPS 轮询</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs">安装命令</Label>
        <div className="flex min-w-0 items-start gap-2">
          <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{currentCommand}</code>
          <CopyButton value={currentCommand} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint} 安装命令会在终端中隐藏提示输入 AgentToken。</p>
    </div>
  );
}
