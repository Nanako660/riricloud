import * as React from 'react';

export interface FormResetOptions {
  /** 弹窗是否打开；常驻页面表单（如节点详情）省略，视为始终打开。 */
  open?: boolean;
  /**
   * 表单身份：编辑对象 id 或 'create'；变化即重新初始化草稿。
   * 传 null 表示数据尚未就绪而跳过，数据到达后自动初始化一次。
   */
  resetKey: string | null;
  /** 同步执行表单初始化（内部通常为 form.reset(...)）；无需也不应放进依赖数组。 */
  reset: () => void;
  /**
   * 可选：服务端数据版本（如 query 的 dataUpdatedAt）。
   * 仅在表单没有未保存修改时才跟随它重新同步，避免轮询/refetch 清空用户草稿。
   */
  dataRevision?: number;
  /** 配合 dataRevision 使用：表单当前是否存在未保存修改。 */
  isDirty?: boolean;
}

/**
 * 表单草稿初始化契约（规范见 docs/FRONTEND_UI_GUIDELINES.md §5）。
 *
 * 仅在 (open, resetKey) 变化时初始化一次；轮询或 refetch 造成的实时数据变化
 * 不会覆盖用户正在编辑的草稿。依赖数组只包含原始值，禁止把 query 的 data
 * 对象、useMemo 派生数组等易变引用作为触发条件。
 */
export function useFormResetOnKey({ open = true, resetKey, reset, dataRevision, isDirty = false }: FormResetOptions): void {
  // 通过 ref 读取最新回调与脏状态，保证它们不参与依赖比较
  const resetRef = React.useRef(reset);
  const isDirtyRef = React.useRef(isDirty);
  React.useEffect(() => {
    resetRef.current = reset;
    isDirtyRef.current = isDirty;
  });

  const appliedKeyRef = React.useRef<string | null>(null);
  const appliedRevisionRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    if (!open || resetKey === null) {
      // 关闭或数据未就绪：清空记录，下次打开/数据到达时重新初始化
      appliedKeyRef.current = null;
      appliedRevisionRef.current = undefined;
      return;
    }

    if (appliedKeyRef.current !== resetKey) {
      appliedKeyRef.current = resetKey;
      appliedRevisionRef.current = dataRevision;
      resetRef.current();
      return;
    }

    if (dataRevision !== undefined && appliedRevisionRef.current !== dataRevision) {
      appliedRevisionRef.current = dataRevision;
      if (!isDirtyRef.current) resetRef.current();
    }
  }, [open, resetKey, dataRevision]);
}
