import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

// 明暗主题三态切换（浅色 / 深色 / 跟随系统），默认跟随操作系统偏好
const THEME_OPTIONS = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor }
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // 触发按钮图标跟随所选模式（而非最终生效外观），否则无法区分「跟随系统」与手动明/暗
  const active =
    THEME_OPTIONS.find((option) => option.value === (theme ?? 'system')) ?? THEME_OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`切换主题（当前：${active.label}）`}>
          <ActiveIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Icon />
            {label}
            {theme === value && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
