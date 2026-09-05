import * as React from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ApiCertificate, CertificateStatus } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { CertificateDetailDialog } from './certificate-detail-dialog';
import { CertificateFormDialog } from './certificate-form-dialog';
import { useAdminCertificates, useCertificateMutations } from './use-certificates';

const statusLabels: Record<CertificateStatus, string> = {
  VALID: '有效',
  EXPIRING: '即将到期',
  EXPIRED: '已过期',
  NOT_YET_VALID: '尚未生效'
};

function statusVariant(status: CertificateStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'EXPIRED') return 'destructive';
  if (status === 'EXPIRING') return 'outline';
  if (status === 'NOT_YET_VALID') return 'secondary';
  return 'default';
}

export default function AdminCertificatesPage() {
  const [search, setSearch] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ApiCertificate | null>(null);
  const { data, isPending, isError } = useAdminCertificates(search);
  const { create, update, remove } = useCertificateMutations();
  const certificates = data?.data ?? [];
  const busy = create.isPending || update.isPending;

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (certificate: ApiCertificate) => {
    setEditingId(certificate.id);
    setFormOpen(true);
  };

  const openDetail = (certificate: ApiCertificate) => {
    setDetailId(certificate.id);
    setDetailOpen(true);
  };

  if (isPending) return <PageContainer><PageHeader title="证书管理" description="集中管理标准 TLS 证书，并在线路中复用。" /><p className="text-sm text-muted-foreground">加载中…</p></PageContainer>;
  if (isError) return <PageContainer><PageHeader title="证书管理" /><EmptyState title="无法加载证书" description="请稍后刷新重试" /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title="证书管理" description="集中管理标准 TLS 证书，并在线路中复用。" />
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、签发者或 SAN" className="pl-9" />
        </div>
        <Button className="w-full lg:w-auto" onClick={openCreate}><Plus />新增证书</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {certificates.length ? <Table className="min-w-[980px]">
            <TableHeader><TableRow><TableHead>证书</TableHead><TableHead>SAN 域名</TableHead><TableHead>签发者</TableHead><TableHead>有效期</TableHead><TableHead>关联线路</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
            <TableBody>{certificates.map((certificate) => <TableRow key={certificate.id}>
              <TableCell>
                <Button type="button" variant="ghost" className="h-auto min-w-0 justify-start p-0 text-left hover:bg-transparent" onClick={() => openDetail(certificate)}>
                  <div className="font-medium hover:underline">{certificate.name}</div>
                  <div className="max-w-56 truncate text-xs text-muted-foreground">{certificate.subject}</div>
                </Button>
              </TableCell>
              <TableCell><div className="flex max-w-64 flex-wrap gap-1">{certificate.sans.slice(0, 4).map((san) => <Badge key={san} variant="secondary">{san}</Badge>)}{certificate.sans.length > 4 && <Badge variant="outline">+{certificate.sans.length - 4}</Badge>}</div></TableCell>
              <TableCell className="max-w-56 truncate text-sm text-muted-foreground">{certificate.issuer}</TableCell>
              <TableCell><div className="flex flex-col items-start gap-1"><Badge variant={statusVariant(certificate.status)}>{statusLabels[certificate.status]}</Badge><span className="text-xs text-muted-foreground">至 {formatDate(certificate.validTo)}</span></div></TableCell>
              <TableCell><span className="font-medium">{certificate.lineCount}</span><span className="ml-1 text-xs text-muted-foreground">条线路</span></TableCell>
              <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="编辑证书" onClick={() => openEdit(certificate)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="删除证书" onClick={() => setDeleting(certificate)}><Trash2 className="text-destructive" /></Button></div></TableCell>
            </TableRow>)}</TableBody>
          </Table> : <EmptyState title="暂无证书" description="添加证书后，可在线路表单中选择并自动同步到节点。" className="border-0" />}
        </CardContent>
      </Card>
      <CertificateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        certificateId={editingId}
        pending={busy}
        onSubmit={(payload) => editingId
          ? update.mutate({ id: editingId, ...payload }, { onSuccess: () => setFormOpen(false) })
          : create.mutate(payload, { onSuccess: () => setFormOpen(false) })}
      />
      <CertificateDetailDialog open={detailOpen} onOpenChange={setDetailOpen} certificateId={detailId} />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>删除证书「{deleting?.name}」？</AlertDialogTitle><AlertDialogDescription>仍被线路引用的证书不能删除，请先解除线路关联。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
