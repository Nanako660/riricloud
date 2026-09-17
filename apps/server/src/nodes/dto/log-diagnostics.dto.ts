import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class LogDiagnosticsDto {
  @ApiProperty({ enum: ['INFO', 'DEBUG'], description: '临时提高 Sing-box 诊断日志级别' })
  @IsIn(['INFO', 'DEBUG'])
  level!: 'INFO' | 'DEBUG';
}
