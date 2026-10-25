import { Module } from '@nestjs/common';
import { PaymentsServiceController } from './payments-service.controller';
import { PaymentsServiceService } from './payments-service.service';
import { KafkaModule } from '@app/kafka';
import { DatabaseModule } from '@app/database';

@Module({
  imports: [KafkaModule.register('payments-service-group'), DatabaseModule],
  controllers: [PaymentsServiceController],
  providers: [PaymentsServiceService],
})
export class PaymentsServiceModule {}
