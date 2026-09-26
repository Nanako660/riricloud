import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { BINARY_TARGET_VALUES, type BinaryTarget } from './binary-targets';

const MAX_EXTRACTED_BINARY_SIZE = 200 * 1024 * 1024;

export interface InspectedBinaryPayload {
  binary: Buffer;
  target: BinaryTarget;
  os: 'linux' | 'macos' | 'windows';
  arch: 'amd64' | 'arm64';
  filename: string;
  upstreamVersion: string | null;
  sha256: string;
  size: number;
}

/**
 * 从上传文件或远程下载 Buffer 中自动解压（支持 .tar.gz / .zip / 裸二进制）、
 * 识别目标平台架构（ELF / Mach-O / PE 魔数头 + 文件名/URL 兜底）、
 * 提取上游版本号（二进制内嵌标记 + 文件名/URL）并计算 SHA-256。
 */
export function inspectBinaryPayload(options: {
  buffer: Buffer;
  hintFilename?: string;
  hintUrl?: string;
  explicitTarget?: string;
  explicitVersion?: string;
}): InspectedBinaryPayload {
  const { buffer, hintFilename, hintUrl, explicitTarget, explicitVersion } = options;
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('二进制文件内容为空');
  }

  // 1. 若是归档包（.tar.gz / .zip），自动提取内部二进制
  const { binary, extractedName } = extractBinaryIfArchive(buffer, hintFilename, hintUrl);
  if (!binary || binary.length === 0) {
    throw new BadRequestException('提取出的二进制文件内容为空');
  }

  // 2. 自动识别目标平台 target (agent-<os>-<arch>)
  const headerTarget = detectTargetFromBinaryHeader(binary);
  const textTarget =
     normalizeTargetCandidate(explicitTarget) ??
    detectTargetFromText(hintFilename) ??
    detectTargetFromText(extractedName) ??
    detectTargetFromText(hintUrl);

  const target = headerTarget ?? textTarget;
  if (!target) {
    throw new BadRequestException(
      '无法从二进制文件头或文件名识别目标平台架构（需为 linux/macos/windows 的 amd64/arm64 架构）'
    );
  }

  const [, os, arch] = target.split('-') as ['agent', 'linux' | 'macos' | 'windows', 'amd64' | 'arm64'];
  const filename = os === 'windows' ? 'riri-agent.exe' : 'riri-agent';

  // 3. 自动提取版本号
  const upstreamVersion =
    normalizeVersionCandidate(explicitVersion) ??
    detectVersionFromBinaryBuffer(binary) ??
    detectVersionFromText(hintFilename) ??
    detectVersionFromText(extractedName) ??
    detectVersionFromText(hintUrl);

  // 4. 自动计算 SHA-256 与体积
  const sha256 = createHash('sha256').update(binary).digest('hex');

  return {
    binary,
    target,
    os,
    arch,
    filename,
    upstreamVersion,
    sha256,
    size: binary.length
  };
}

function extractBinaryIfArchive(
  buffer: Buffer,
  hintFilename?: string,
  hintUrl?: string
): { binary: Buffer; extractedName?: string } {
  const lowerHint = `${hintFilename ?? ''} ${hintUrl ?? ''}`.toLowerCase();

  // GZIP (.tar.gz / .tgz) 魔数: 0x1f 0x8b
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return extractFromTarGzBuffer(buffer);
  }

  // ZIP 魔数: PK\x03\x04 (0x50 0x4b 0x03 0x04)
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return extractFromZipBuffer(buffer);
  }

  if (lowerHint.endsWith('.tar.gz') || lowerHint.endsWith('.tgz')) {
    return extractFromTarGzBuffer(buffer);
  }
  if (lowerHint.endsWith('.zip')) {
    return extractFromZipBuffer(buffer);
  }

  return { binary: buffer };
}

function extractFromTarGzBuffer(gzBuffer: Buffer): { binary: Buffer; extractedName?: string } {
  let tarBuffer: Buffer;
  try {
    tarBuffer = gunzipSync(gzBuffer, { maxOutputLength: MAX_EXTRACTED_BINARY_SIZE });
  } catch (error) {
    throw new BadRequestException(`解压 .tar.gz 归档失败: ${(error as Error).message}`);
  }

  let offset = 0;
  let fallbackCandidate: { binary: Buffer; extractedName: string } | null = null;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '').trim();
    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const fileSize = parseInt(sizeOctal || '0', 8);
    const typeFlag = header[156];
    const dataStart = offset + 512;
    const dataEnd = dataStart + fileSize;

    if (!Number.isFinite(fileSize) || fileSize < 0 || dataEnd > tarBuffer.length) {
      break;
    }

    const isRegularFile = typeFlag === 0 || typeFlag === 48; // '\0' or '0'
    if (isRegularFile && fileSize > 0) {
      const baseName = rawName.split('/').pop() ?? rawName;
      const content = Buffer.from(tarBuffer.subarray(dataStart, dataEnd));
      if (baseName === 'riri-agent' || baseName === 'riri-agent.exe' || baseName.startsWith('riri-agent')) {
        return { binary: content, extractedName: rawName };
      }
      if (
        !baseName.endsWith('.txt') &&
        !baseName.endsWith('.md') &&
        !baseName.endsWith('.json') &&
        (!fallbackCandidate || content.length > fallbackCandidate.binary.length)
      ) {
        fallbackCandidate = { binary: content, extractedName: rawName };
      }
    }

    offset = dataStart + Math.ceil(fileSize / 512) * 512;
  }

  if (fallbackCandidate) return fallbackCandidate;
  throw new BadRequestException('在 .tar.gz 归档中未找到有效的 riri-agent 二进制文件');
}

function extractFromZipBuffer(zipBuffer: Buffer): { binary: Buffer; extractedName?: string } {
  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, zipBuffer.length - 65557);
  for (let i = zipBuffer.length - 22; i >= minEocdSearch; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new BadRequestException('无效的 ZIP 归档文件');
  }

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  let ptr = centralDirOffset;
  let fallbackCandidate: { binary: Buffer; extractedName: string } | null = null;

  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > zipBuffer.length || zipBuffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const compressionMethod = zipBuffer.readUInt16LE(ptr + 10);
    const compressedSize = zipBuffer.readUInt32LE(ptr + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(ptr + 24);
    const fileNameLen = zipBuffer.readUInt16LE(ptr + 28);
    const extraLen = zipBuffer.readUInt16LE(ptr + 30);
    const commentLen = zipBuffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(ptr + 42);
    const fileName = zipBuffer.subarray(ptr + 46, ptr + 46 + fileNameLen).toString('utf8');
    ptr += 46 + fileNameLen + extraLen + commentLen;

    if (fileName.endsWith('/') || uncompressedSize === 0) continue;
    if (uncompressedSize > MAX_EXTRACTED_BINARY_SIZE) {
      throw new BadRequestException('ZIP 归档内文件超出最大体积限制');
    }

    if (localHeaderOffset + 30 > zipBuffer.length || zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      continue;
    }
    const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize);

    let content: Buffer;
    if (compressionMethod === 0) {
      content = Buffer.from(compressedData);
    } else if (compressionMethod === 8) {
      content = inflateRawSync(compressedData, { maxOutputLength: MAX_EXTRACTED_BINARY_SIZE });
    } else {
      continue;
    }

    const baseName = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
    if (baseName === 'riri-agent.exe' || baseName === 'riri-agent' || baseName.startsWith('riri-agent')) {
      return { binary: content, extractedName: fileName };
    }
    if (
      !baseName.endsWith('.txt') &&
      !baseName.endsWith('.md') &&
      !baseName.endsWith('.json') &&
      (!fallbackCandidate || content.length > fallbackCandidate.binary.length)
    ) {
      fallbackCandidate = { binary: content, extractedName: fileName };
    }
  }

  if (fallbackCandidate) return fallbackCandidate;
  throw new BadRequestException('在 ZIP 归档中未找到有效的 riri-agent 二进制文件');
}

/**
 * 通过二进制文件魔数头（ELF / Mach-O / PE）直接识别 OS 与 CPU 架构
 */
export function detectTargetFromBinaryHeader(binary: Buffer): BinaryTarget | null {
  if (binary.length >= 20 && binary[0] === 0x7f && binary[1] === 0x45 && binary[2] === 0x4c && binary[3] === 0x46) {
    // ELF: byte 5 为字节序 (1 = LE, 2 = BE)，offset 18 为 e_machine
    const isBigEndian = binary[5] === 2;
    const machine = isBigEndian ? binary.readUInt16BE(18) : binary.readUInt16LE(18);
    if (machine === 0x3e) return 'agent-linux-amd64';
    if (machine === 0xb7) return 'agent-linux-arm64';
  }

  if (binary.length >= 8) {
    const magicLE = binary.readUInt32LE(0);
    const magicBE = binary.readUInt32BE(0);
    // Mach-O 64-bit: 0xFEEDFACF
    if (magicLE === 0xfeedfacf || magicBE === 0xfeedfacf) {
      const cpuType = magicLE === 0xfeedfacf ? binary.readUInt32LE(4) : binary.readUInt32BE(4);
      if (cpuType === 0x01000007) return 'agent-macos-amd64';
      if (cpuType === 0x0100000c) return 'agent-macos-arm64';
    }
  }

  // PE / COFF (MZ header)
  if (binary.length >= 0x40 && binary[0] === 0x4d && binary[1] === 0x5a) {
    const peOffset = binary.readUInt32LE(0x3c);
    if (
      peOffset > 0 &&
      peOffset + 6 <= binary.length &&
      binary[peOffset] === 0x50 &&
      binary[peOffset + 1] === 0x45 &&
      binary[peOffset + 2] === 0x00 &&
      binary[peOffset + 3] === 0x00
    ) {
      const machine = binary.readUInt16LE(peOffset + 4);
      if (machine === 0x8664) return 'agent-windows-amd64';
    }
  }

  return null;
}

export function normalizeTargetCandidate(raw?: string | null): BinaryTarget | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if ((BINARY_TARGET_VALUES as readonly string[]).includes(trimmed)) {
    return trimmed as BinaryTarget;
  }
  const withPrefix = trimmed.startsWith('agent-') ? trimmed : `agent-${trimmed.replace(/^darwin-/, 'macos-')}`;
  if ((BINARY_TARGET_VALUES as readonly string[]).includes(withPrefix)) {
    return withPrefix as BinaryTarget;
  }
  return null;
}

export function detectTargetFromText(text?: string | null): BinaryTarget | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const match = lower.match(/(linux|darwin|macos|windows)[-_/](amd64|x86_64|x64|arm64|aarch64)/);
  if (!match) return null;
  const os = match[1] === 'darwin' ? 'macos' : (match[1] as 'linux' | 'macos' | 'windows');
  const arch = match[2] === 'arm64' || match[2] === 'aarch64' ? 'arm64' : 'amd64';
  const candidate = `agent-${os}-${arch}`;
  return (BINARY_TARGET_VALUES as readonly string[]).includes(candidate) ? (candidate as BinaryTarget) : null;
}

export function detectVersionFromBinaryBuffer(binary: Buffer): string | null {
  // 1. 优先匹配构建注入的显式标记 RIRICLOUD_AGENT_VERSION:<semver>
  const markerPrefix = Buffer.from('RIRICLOUD_AGENT_VERSION:', 'ascii');
  const markerIdx = binary.indexOf(markerPrefix);
  if (markerIdx >= 0) {
    const start = markerIdx + markerPrefix.length;
    const slice = binary.subarray(start, Math.min(binary.length, start + 64)).toString('ascii');
    const match = slice.match(/^v?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export function detectVersionFromText(text?: string | null): string | null {
  if (!text) return null;
  // 匹配常见的发布标签与包名格式：agent-v0.4.14, riri-agent_0.4.14_linux_amd64.tar.gz, v0.4.14 等
  const patterns = [
    /agent[-_]?v([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?)/i,
    /riri-agent[-_v]+([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?)/i,
    /\bv?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?)\b/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/-r\d+$/i, '');
    }
  }
  return null;
}

function normalizeVersionCandidate(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^(?:agent-)?v/i, '').replace(/-r\d+$/i, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}
