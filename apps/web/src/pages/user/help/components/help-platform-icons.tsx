import {
  Apple,
  HelpCircle,
  Laptop,
  Monitor,
  Network,
  Radio,
  Smartphone,
  Terminal,
  type LucideIcon
} from 'lucide-react';
import type { PlatformType } from '../use-help-articles';

export function getPlatformIcon(platform: PlatformType | string, iconName?: string | null): LucideIcon {
  if (iconName) {
    switch (iconName.toLowerCase()) {
      case 'monitor':
      case 'windows':
        return Monitor;
      case 'laptop':
      case 'mac':
      case 'macos':
        return Laptop;
      case 'smartphone':
      case 'iphone':
      case 'android':
      case 'mobile':
        return Smartphone;
      case 'apple':
      case 'ios':
        return Apple;
      case 'helpcircle':
      case 'faq':
        return HelpCircle;
      case 'router':
      case 'network':
        return Network;
      case 'terminal':
      case 'linux':
        return Terminal;
      default:
        break;
    }
  }

  switch (platform.toUpperCase()) {
    case 'WINDOWS':
      return Monitor;
    case 'MACOS':
      return Laptop;
    case 'IOS':
      return Smartphone;
    case 'ANDROID':
      return Smartphone;
    case 'ROUTER':
      return Radio;
    case 'FAQ':
      return HelpCircle;
    default:
      return HelpCircle;
  }
}
