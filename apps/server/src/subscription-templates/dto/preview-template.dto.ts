import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject } from 'class-validator';
import type { CreateTemplateDto } from './create-template.dto';

export interface KernelCheckResult {
  executed: boolean;
  passed: boolean;
  message?: string;
}

export type SingboxCheckResult = KernelCheckResult;
export type MihomoCheckResult = KernelCheckResult;

export class PreviewTemplateDto {
  @ApiProperty({ enum: ['clash', 'singbox'] })
  @IsIn(['clash', 'singbox'])
  format!: 'clash' | 'singbox';

  @ApiProperty({ type: Object, description: '待渲染的模板草稿，字段与创建模板请求一致' })
  @IsObject()
  template!: Partial<CreateTemplateDto>;
}
