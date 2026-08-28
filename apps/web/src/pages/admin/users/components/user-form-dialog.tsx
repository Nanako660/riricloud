import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUserMutations, type AdminUser } from '../use-users';

const GB = 1024 ** 3;

const createSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码至少 8 位').max(64),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  quotaGB: z.coerce.number().min(1, '配额至少 1 GB').max(1048576, '过大'),
  permanent: z.boolean().default(true),
  expireAt: z.string().optional()
});

const editSchema = z
  .object({
    role: z.enum(['USER', 'ADMIN']),
    quotaGB: z.coerce.number().min(1).max(1048576),
    permanent: z.boolean(),
    expireAt: z.string().optional(),
    isActive: z.boolean(),
    password: z.string().min(8, '密码至少 8 位').max(64).optional().or(z.literal(''))
  })
  .refine((v) => v.permanent || !!v.expireAt, {
    message: '请填写到期日期或选择永久有效',
    path: ['expireAt']
  });

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑目标（null=创建） */
  user: AdminUser | null;
  /** 当前登录管理员 id：禁止修改自己的角色 */
  selfId: string;
}

export function UserFormDialog({ open, onOpenChange, user, selfId }: UserFormDialogProps) {
  const { createUser, updateUser } = useUserMutations();
  const isEdit = !!user;
  const isSelf = user?.id === selfId;

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { role: 'USER', quotaGB: 100, permanent: true, expireAt: '', isActive: true, password: '' }
  });

  // 打开时用目标用户回填
  useEffect(() => {
    if (user && open) {
      editForm.reset({
        role: user.role,
        quotaGB: Math.round(user.trafficLimitBytes / GB),
        permanent: !user.expireAt,
        expireAt: user.expireAt ? user.expireAt.slice(0, 10) : '',
        isActive: user.isActive,
        password: ''
      });
    }
  }, [user, open, editForm]);

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: '', password: '', role: 'USER', quotaGB: 100, permanent: true, expireAt: '' }
  });

  const onEditSubmit = (v: EditForm) => {
    if (!user) return;
    updateUser.mutate(
      {
        id: user.id,
        role: v.role,
        trafficLimitBytes: Math.round(v.quotaGB * GB),
        expireAt: v.permanent ? null : new Date(`${v.expireAt}T23:59:59Z`).toISOString(),
        isActive: v.isActive,
        ...(v.password ? { password: v.password } : {})
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const onCreateSubmit = (v: CreateForm) => {
    createUser.mutate(
      {
        email: v.email,
        password: v.password,
        role: v.role,
        trafficLimitBytes: Math.round(v.quotaGB * GB),
        ...(v.permanent || !v.expireAt ? {} : { expireAt: new Date(`${v.expireAt}T23:59:59Z`).toISOString() })
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `编辑用户 ${user?.email}` : '创建用户'}</DialogTitle>
          <DialogDescription>{isEdit ? '修改角色、配额、有效期与激活状态' : '新用户默认配额可在系统设置中调整'}</DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <Form {...editForm}>
            <form className="space-y-4" onSubmit={editForm.handleSubmit(onEditSubmit)}>
              <FormField
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>角色</FormLabel>
                    <Select disabled={isSelf} onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="USER">用户</SelectItem>
                        <SelectItem value="ADMIN">管理员</SelectItem>
                      </SelectContent>
                    </Select>
                    {isSelf ? <FormDescription>不能修改自己的角色</FormDescription> : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="quotaGB"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>流量配额（GB）</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={editForm.control}
                  name="permanent"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel>永久有效</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel>启用账号</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              {!editForm.watch('permanent') ? (
                <FormField
                  control={editForm.control}
                  name="expireAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>到期日期</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={editForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>重置密码（可选）</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="留空表示不修改" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={updateUser.isPending}>
                  {updateUser.isPending ? '保存中…' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form className="space-y-4" onSubmit={createForm.handleSubmit(onCreateSubmit)}>
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="user@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>初始密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="至少 8 位" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={createForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>角色</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="USER">用户</SelectItem>
                          <SelectItem value="ADMIN">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="quotaGB"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>配额（GB）</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={createForm.control}
                name="permanent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>永久有效</FormLabel>
                      <FormDescription>关闭后需填写到期日期</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              {!createForm.watch('permanent') ? (
                <FormField
                  control={createForm.control}
                  name="expireAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>到期日期</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={createUser.isPending}>
                  {createUser.isPending ? '创建中…' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
