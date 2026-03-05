import { Module } from '@nestjs/common';
import { GenericSecretsModule } from './generic-secrets/generic-secrets.module';

@Module({
  imports: [GenericSecretsModule],
})
export class AppModule {}
