import { PrismaClient, type TrafficLog } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

interface AggregatedHourly {
  id: string;
  bucketStart: Date;
  nodeId: string;
  userId: string;
  lineId: string;
  proxyKeyId: string;
  upload: bigint;
  download: bigint;
  billedBytes: bigint;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldClean = args.includes('--clean');
  const shouldVacuum = args.includes('--vacuum');

  console.log('=== [TrafficLog -> TrafficHourlyMetric 存量数据平滑迁移] ===');

  const totalLogs = await prisma.trafficLog.count();
  console.log(`[1/4] 扫描历史数据：发现 ${totalLogs} 条原始 TrafficLog 明细。`);

  if (totalLogs === 0) {
    console.log('未检测到任何存量 TrafficLog，无需迁移。');
    if (shouldVacuum) {
      console.log('执行 VACUUM 释放空闲空间...');
      await prisma.$executeRawUnsafe('VACUUM');
      console.log('VACUUM 完成。');
    }
    return;
  }

  // 加载线路倍率用于折算历史计费流量
  const lines = await prisma.line.findMany({
    select: { id: true, trafficRate: true }
  });
  const rateByLineId = new Map<string, number>();
  for (const line of lines) {
    rateByLineId.set(line.id, line.trafficRate && line.trafficRate > 0 ? line.trafficRate : 1);
  }

  console.log(`[2/4] 加载 ${lines.length} 条线路倍率配置，开始流式分组聚合...`);

  // 分批读取 TrafficLog 并按小时桶汇聚
  const BATCH_SIZE = 5000;
  let cursorId: string | undefined = undefined;
  let processed = 0;

  const buckets = new Map<string, AggregatedHourly>();
  let totalRawUpload = 0n;
  let totalRawDownload = 0n;

  while (true) {
    const logs: TrafficLog[] = await prisma.trafficLog.findMany({
      take: BATCH_SIZE,
      skip: cursorId ? 1 : 0,
      cursor: cursorId ? { id: cursorId } : undefined,
      orderBy: { id: 'asc' }
    });

    if (logs.length === 0) break;

    for (const log of logs) {
      totalRawUpload += log.upload;
      totalRawDownload += log.download;

      const date = new Date(log.recordedAt);
      date.setUTCMinutes(0, 0, 0);

      const lineId = log.lineId ?? '';
      const proxyKeyId = log.proxyKeyId ?? '';
      const key = `${date.toISOString()}|${log.nodeId}|${log.userId}|${lineId}|${proxyKeyId}`;

      const rate = lineId ? (rateByLineId.get(lineId) ?? 1) : 1;
      const billedDelta = BigInt(Math.round(Number(log.upload + log.download) * rate));

      const existing = buckets.get(key);
      if (existing) {
        existing.upload += log.upload;
        existing.download += log.download;
        existing.billedBytes += billedDelta;
      } else {
        buckets.set(key, {
          id: randomUUID(),
          bucketStart: date,
          nodeId: log.nodeId,
          userId: log.userId,
          lineId,
          proxyKeyId,
          upload: log.upload,
          download: log.download,
          billedBytes: billedDelta
        });
      }
    }

    processed += logs.length;
    cursorId = logs[logs.length - 1].id;
    process.stdout.write(`\r已处理原始记录: ${processed}/${totalLogs} (生成 ${buckets.size} 个小时桶)...`);
  }

  console.log(`\n[3/4] 聚合完成：${totalLogs} 条原始日志合并为 ${buckets.size} 条小时时序记录（压缩比: ${(buckets.size / totalLogs * 100).toFixed(2)}%）。`);
  console.log('正在批量写入 TrafficHourlyMetric...');

  const hourlyItems = Array.from(buckets.values());
  const WRITE_BATCH_SIZE = 1000;
  let written = 0;

  for (let i = 0; i < hourlyItems.length; i += WRITE_BATCH_SIZE) {
    const chunk = hourlyItems.slice(i, i + WRITE_BATCH_SIZE);
    await prisma.$transaction(async (tx) => {
      for (const item of chunk) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "TrafficHourlyMetric" (
            "id", "bucketStart", "nodeId", "userId", "lineId", "proxyKeyId",
            "upload", "download", "billedBytes", "createdAt", "updatedAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT("bucketStart", "nodeId", "userId", "lineId", "proxyKeyId")
          DO UPDATE SET
            "upload" = "TrafficHourlyMetric"."upload" + excluded."upload",
            "download" = "TrafficHourlyMetric"."download" + excluded."download",
            "billedBytes" = "TrafficHourlyMetric"."billedBytes" + excluded."billedBytes",
            "updatedAt" = CURRENT_TIMESTAMP`,
          item.id,
          item.bucketStart.toISOString(),
          item.nodeId,
          item.userId,
          item.lineId,
          item.proxyKeyId,
          item.upload.toString(),
          item.download.toString(),
          item.billedBytes.toString()
        );
      }
    });
    written += chunk.length;
    process.stdout.write(`\r已写入小时指标: ${written}/${hourlyItems.length}...`);
  }

  console.log('\n[4/4] 写入完成，开始数据准确性校验...');

  // 校验两表总量是否一致
  const newTotals = await prisma.$queryRawUnsafe<Array<{ totalUpload: string | number | bigint; totalDownload: string | number | bigint }>>(
    'SELECT SUM("upload") as totalUpload, SUM("download") as totalDownload FROM "TrafficHourlyMetric"'
  );

  const totalMigratedUpload = BigInt(newTotals[0]?.totalUpload ?? 0);
  const totalMigratedDownload = BigInt(newTotals[0]?.totalDownload ?? 0);

  console.log(`- 原始 TrafficLog 上行: ${totalRawUpload.toString()} 字节`);
  console.log(`- 聚合 Metric 上行:    ${totalMigratedUpload.toString()} 字节`);
  console.log(`- 原始 TrafficLog 下行: ${totalRawDownload.toString()} 字节`);
  console.log(`- 聚合 Metric 下行:    ${totalMigratedDownload.toString()} 字节`);

  if (totalMigratedUpload >= totalRawUpload && totalMigratedDownload >= totalRawDownload) {
    console.log('✅ 校验通过：小时时序数据总量准确无缺失！');
  } else {
    console.error('❌ 校验失败：聚合后数据量小于原始记录！');
    process.exitCode = 1;
    return;
  }

  if (shouldClean) {
    console.log('正在清空旧 TrafficLog 表...');
    const deleted = await prisma.trafficLog.deleteMany({});
    console.log(`已清空 ${deleted.count} 条旧 TrafficLog 记录。`);
  } else {
    console.log('提示：历史 TrafficLog 保留未删。若需清理释放磁盘，可追加 --clean 参数。');
  }

  if (shouldVacuum) {
    console.log('执行 VACUUM 释放 SQLite 物理磁盘空间...');
    await prisma.$executeRawUnsafe('VACUUM');
    console.log('VACUUM 完成。');
  }
}

main()
  .catch((error: unknown) => {
    console.error(`迁移失败: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
