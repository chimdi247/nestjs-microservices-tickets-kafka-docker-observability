import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [HttpModule],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
