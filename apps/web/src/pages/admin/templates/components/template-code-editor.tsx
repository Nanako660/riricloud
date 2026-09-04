import CodeMirror, { type ReactCodeMirrorProps } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

type TemplateCodeEditorProps = Omit<ReactCodeMirrorProps, 'theme'>;

const templateEditorScrollTheme = EditorView.theme({
  '&': { minHeight: '0' },
  '.cm-scroller': {
    height: '100% !important',
    minHeight: '0',
    overflowX: 'auto',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    scrollbarGutter: 'stable'
  }
});

export function TemplateCodeEditor({ className, extensions = [], ...props }: TemplateCodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  return <CodeMirror {...props} extensions={[templateEditorScrollTheme, ...extensions]} minHeight={props.minHeight ?? '0'} theme={editorTheme} className={cn('h-full min-h-0 min-w-0 overflow-hidden', className)} />;
}
