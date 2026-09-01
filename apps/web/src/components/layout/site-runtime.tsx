import { useEffect } from 'react';
import { usePublicSettings } from '@/lib/public-settings';

const CUSTOM_STYLE_ID = 'riricloud-custom-css';
const CUSTOM_HEAD_ATTRIBUTE = 'data-riricloud-custom-head';

// 全局站点设置只在运行时挂载，避免把管理员输入混入构建产物。
export function SiteRuntime() {
  const settingsQuery = usePublicSettings();

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;

    const previousTitle = document.title;
    document.title = settings.siteName || 'RiriCloud';

    let favicon = document.querySelector<HTMLLinkElement>('link[data-riricloud-favicon]');
    if (settings.faviconUrl) {
      favicon ??= document.head.appendChild(document.createElement('link'));
      favicon.dataset.riricloudFavicon = 'true';
      favicon.rel = 'icon';
      favicon.href = settings.faviconUrl;
    } else if (favicon) {
      favicon.remove();
    }

    let style = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
    if (settings.customCss) {
      style ??= document.head.appendChild(document.createElement('style'));
      style.id = CUSTOM_STYLE_ID;
      style.textContent = settings.customCss;
    } else {
      style?.remove();
    }

    document.head.querySelectorAll(`[${CUSTOM_HEAD_ATTRIBUTE}]`).forEach((node) => node.remove());
    if (settings.customHeadHtml.trim()) {
      const template = document.createElement('template');
      template.innerHTML = settings.customHeadHtml;
      template.content.childNodes.forEach((source) => {
        const node = source.nodeName.toLowerCase() === 'script'
          ? copyScriptNode(source as HTMLScriptElement)
          : source.cloneNode(true);
        if (node instanceof HTMLElement || node instanceof SVGElement) node.setAttribute(CUSTOM_HEAD_ATTRIBUTE, 'true');
        document.head.appendChild(node);
      });
    }

    return () => {
      document.title = previousTitle;
      document.getElementById(CUSTOM_STYLE_ID)?.remove();
      document.head.querySelectorAll(`[${CUSTOM_HEAD_ATTRIBUTE}]`).forEach((node) => node.remove());
      document.querySelector('link[data-riricloud-favicon]')?.remove();
    };
  }, [settingsQuery.data]);

  return null;
}

function copyScriptNode(source: HTMLScriptElement) {
  const script = document.createElement('script');
  for (const attribute of source.attributes) script.setAttribute(attribute.name, attribute.value);
  script.textContent = source.textContent;
  return script;
}
