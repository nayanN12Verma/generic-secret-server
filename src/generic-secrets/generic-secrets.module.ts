import { Module } from '@nestjs/common';
import { GenericSecretsController } from './generic-secrets.controller';
import { GenericSecretsService } from './generic-secrets.service';

@Module({
  controllers: [GenericSecretsController],
  providers: [GenericSecretsService]
})
export class GenericSecretsModule {}
