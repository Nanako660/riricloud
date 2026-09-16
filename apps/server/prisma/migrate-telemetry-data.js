'use strict';

/**
 * RiriCloud 存量遥测与日志物理分库数据搬移脚本
 * 将已有主库（app.db / dev.db）中的 TrafficHourlyMetric、NodeRateMetric 与 SystemLog
 * 原生安全搬移至独立观测库（telemetry.db），防止在随后的 prisma migrate deploy 中丢失。
 */

const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

function parseSqlitePath(url, baseDir) {
  if (!url || typeof url !== 'string') return null;
  const raw = url.replace(/^file:/, '').split('?')[0];
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(baseDir, raw);
}

async function migrateTelemetryData() {
  const prismaDir = path.resolve(__dirname);
  const telemetryDir = path.resolve(__dirname, 'telemetry');

  const mainDbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  const telemDbUrl = process.env.TELEMETRY_DATABASE_URL || 'file:./dev-telemetry.db';

  const mainDbPath = parseSqlitePath(mainDbUrl, prismaDir);
  const telemDbPath = parseSqlitePath(telemDbUrl, telemetryDir);

  if (!mainDbPath || !fs.existsSync(mainDbPath)) {
    return;
  }
  if (!telemDbPath || !fs.existsSync(telemDbPath)) {
    return;
  }

  const prisma = new PrismaClient({
    datasources: {
      db: { url: mainDbUrl }
    }
  });

  try {
    const existingTables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('TrafficHourlyMetric', 'NodeRateMetric', 'SystemLog')"
    );

    if (!Array.isArray(existingTables) || existingTables.length === 0) {
      return;
    }

    const tableNames = new Set(existingTables.map((t) => t.name));
    const normalizedTelemPath = telemDbPath.replace(/\\/g, '/');

    console.log(`[telemetry-migration] Detected legacy telemetry tables in main DB (${[...tableNames].join(', ')}).`);
    console.log(`[telemetry-migration] Attaching telemetry database: ${normalizedTelemPath}`);

    await prisma.$executeRawUnsafe(`ATTACH DATABASE "${normalizedTelemPath}" AS telemetry`);

    let totalCopied = 0;

    if (tableNames.has('TrafficHourlyMetric')) {
      const count = await prisma.$executeRawUnsafe(
        'INSERT OR IGNORE INTO telemetry.TrafficHourlyMetric SELECT * FROM main.TrafficHourlyMetric'
      );
      console.log(`[telemetry-migration] Migrated ${count} TrafficHourlyMetric rows.`);
      totalCopied += count;
    }

    if (tableNames.has('NodeRateMetric')) {
      const count = await prisma.$executeRawUnsafe(
        'INSERT OR IGNORE INTO telemetry.NodeRateMetric SELECT * FROM main.NodeRateMetric'
      );
      console.log(`[telemetry-migration] Migrated ${count} NodeRateMetric rows.`);
      totalCopied += count;
    }

    if (tableNames.has('SystemLog')) {
      const count = await prisma.$executeRawUnsafe(
        'INSERT OR IGNORE INTO telemetry.SystemLog SELECT * FROM main.SystemLog'
      );
      console.log(`[telemetry-migration] Migrated ${count} SystemLog rows.`);
      totalCopied += count;
    }

    await prisma.$executeRawUnsafe('DETACH DATABASE telemetry');
    console.log(`[telemetry-migration] Telemetry data migration completed successfully (${totalCopied} total rows copied).`);
  } catch (error) {
    console.warn(`[telemetry-migration] Telemetry data migration encountered a non-fatal error: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrateTelemetryData()
    .catch((err) => {
      console.error(`[telemetry-migration] Unexpected error: ${err.message}`);
      process.exitCode = 0; // 即使出现异常也不阻断应用启动
    });
}

module.exports = { migrateTelemetryData };
