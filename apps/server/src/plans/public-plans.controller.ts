import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Public()
@Controller('plans')
export class PublicPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('public')
  list() {
    return this.plansService.listPublic();
  }
}
