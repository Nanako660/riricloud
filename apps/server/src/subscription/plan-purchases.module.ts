import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanPurchasesService } from './plan-purchases.service';

@Module({ imports: [PrismaModule], providers: [PlanPurchasesService], exports: [PlanPurchasesService] })
export class PlanPurchasesModule {}
