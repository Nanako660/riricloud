import { Fragment, type ReactNode } from 'react';

// 公告只需要安全的常用 Markdown 子集，避免为一段管理员文案引入完整渲染器。
export function MarkdownText({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  return (
    <div className="space-y-1.5 whitespace-pre-wrap text-sm leading-6">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;
        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        const listItem = trimmed.match(/^[-*]\s+(.+)$/);
        if (heading) {
          return <p key={index} className="font-semibold">{renderInline(heading[2])}</p>;
        }
        if (listItem) {
          return <p key={index} className="pl-4 before:mr-2 before:content-['•']">{renderInline(listItem[1])}</p>;
        }
        return <p key={index}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(value: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) result.push(value.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      result.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      result.push(<code key={`${match.index}-code`} className="rounded bg-muted px-1 py-0.5 text-xs">{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link) {
        result.push(<a key={`${match.index}-link`} className="text-primary underline underline-offset-4" href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
      } else {
        result.push(<Fragment key={`${match.index}-text`}>{token}</Fragment>);
      }
    }
    cursor = match.index + token.length;
  }
  if (cursor < value.length) result.push(value.slice(cursor));
  return result;
}
