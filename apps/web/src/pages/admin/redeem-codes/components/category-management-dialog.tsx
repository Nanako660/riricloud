import { useState } from 'react';
import { Archive, Pencil, Plus, RotateCcw, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CategoryFormDialog } from './category-form-dialog';
import type { Plan } from '../../plans/use-plans';
import type { RedeemCodeCategory, RedeemCodeCategoryPayload } from '../use-redeem-codes';

interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; categories: RedeemCodeCategory[]; plans: Plan[];
  pending: boolean; onSave: (payload: RedeemCodeCategoryPayload, category?: RedeemCodeCategory) => Promise<void>;
}

export function CategoryManagementDialog({ open, onOpenChange, categories, plans, pending, onSave }: Props) {
  const { t } = useTranslation(['admin', 'common']);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<RedeemCodeCategory | null>(null);
  const openForm = (category: RedeemCodeCategory | null) => { setSelected(category); setFormOpen(true); };
  return <>
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}><ResponsiveDialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Tags className="size-4" />{t('admin:redeemCodes.manageCategories')}</DialogTitle><DialogDescription>{t('admin:redeemCodes.categoryDialogDesc')}</DialogDescription></DialogHeader>
      <div className="flex justify-end"><Button onClick={() => openForm(null)}><Plus className="size-4" />{t('admin:redeemCodes.createCategory')}</Button></div>
      <div className="max-h-[55vh] overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>{t('admin:redeemCodes.categoryName')}</TableHead><TableHead>{t('admin:redeemCodes.colValue')}</TableHead><TableHead>{t('admin:redeemCodes.identityLimit')}</TableHead><TableHead>{t('admin:redeemCodes.categoryCodes')}</TableHead><TableHead>{t('admin:redeemCodes.colStatus')}</TableHead><TableHead className="text-right">{t('common:table.actions')}</TableHead></TableRow></TableHeader>
        <TableBody>{categories.map((category) => <TableRow key={category.id}>
          <TableCell><div className="font-medium">{category.name}</div>{category.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{category.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>}</TableCell>
          <TableCell>{category.rewardType === 'BALANCE' ? t('admin:redeemCodes.balanceReward', { amount: (category.rewardAmount ?? 0) / 100 }) : category.plan?.name ?? t('admin:redeemCodes.typePlan')}</TableCell>
          <TableCell>{category.limitPerIdentity == null ? t('admin:redeemCodes.unlimited') : t('admin:redeemCodes.identityLimitCount', { count: category.limitPerIdentity })}</TableCell>
          <TableCell>{category.codeCount}</TableCell><TableCell><Badge variant={category.isActive ? 'secondary' : 'outline'}>{category.isActive ? t('admin:redeemCodes.categoryActive') : t('admin:redeemCodes.categoryArchived')}</Badge></TableCell>
          <TableCell className="text-right"><div className="flex justify-end gap-1">{category.id !== 'legacy-redeem-code-category' && <Button variant="ghost" size="icon" aria-label={t('admin:redeemCodes.editCategory')} onClick={() => openForm(category)}><Pencil className="size-4" /></Button>}{category.id !== 'legacy-redeem-code-category' && <Button variant="ghost" size="icon" aria-label={category.isActive ? t('admin:redeemCodes.archiveCategory') : t('admin:redeemCodes.restoreCategory')} disabled={pending} onClick={() => { void onSave({ name: category.name, tags: category.tags, rewardType: category.rewardType, ...(category.rewardType === 'BALANCE' ? { rewardAmount: category.rewardAmount ?? undefined } : { planId: category.planId ?? undefined }), limitPerIdentity: category.limitPerIdentity, isActive: !category.isActive }, category).catch(() => undefined); }}>{category.isActive ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}</Button>}</div></TableCell>
        </TableRow>)}</TableBody></Table></div>
    </ResponsiveDialogContent></ResponsiveDialog>
    <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={selected} plans={plans} pending={pending} onSubmit={(payload) => onSave(payload, selected ?? undefined)} />
  </>;
}
