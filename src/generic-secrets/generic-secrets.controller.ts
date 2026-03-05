import { Body, Controller, Delete, Get, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { GenericSecretsService } from './generic-secrets.service';

@Controller('secrets')
@ApiTags('Secrets')
export class GenericSecretsController {

  constructor(private readonly secretsService: GenericSecretsService) {}

  @Get()
  @ApiOperation({ summary: 'List secrets in a directory' })
  @ApiQuery({ name: 'path', required: true, example: 'tfy-secrets/truefoundry' })
  @ApiOkResponse({
    description: 'List of keys under directory',
    schema: { example: { keys: ['temp/', 'testkey2'] } },
  })
  @ApiNotFoundResponse({ description: 'Directory not found' })
  async listSecrets(@Query('path') path?: string): Promise<{ keys: string[] }> {
    const keys = await this.secretsService.listSecrets(path || '');
    return { keys };
  }

  @Get('data')
  @ApiOperation({ summary: 'Get secret value by path' })
  @ApiQuery({ name: 'path', required: true, example: 'tfy-secrets/truefoundry/testkey2' })
  @ApiQuery({ name: 'version', required: false, example: '1' })
  @ApiOkResponse({
    description: 'Secret value',
    schema: { example: { value: 'secret-value' } },
  })
  @ApiBadRequestResponse({ description: 'Path is a directory and not a secret' })
  @ApiNotFoundResponse({ description: 'Secret path not found' })
  async getSecret(@Query('path') path?: string, @Query('version') version?: string): Promise<{ value: string }> {
    const value = await this.secretsService.getSecret(path || '', version);
    return { value };
  }

  @Put()
  @ApiOperation({ summary: 'Create or update a secret' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['path', 'value'],
      properties: {
        path: { type: 'string', example: 'tfy-secrets/truefoundry/testkey4' },
        value: { type: 'string', example: 'test-secret-value' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Created/updated secret path and version',
    schema: { example: { path: 'tfy-secrets/truefoundry/testkey4', version: 1 } },
  })
  @ApiBadRequestResponse({ description: 'Directory path is invalid for secret write' })
  async createOrUpdateSecret(
    @Body() body: { path?: string; value?: string },
  ): Promise<{ path: string; version: number }> {
    return this.secretsService.createOrUpdateSecret(body?.path || '', body?.value || '');
  }

  @Delete()
  @ApiOperation({ summary: 'Delete secret path or specific version' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', example: 'tfy-secrets/truefoundry/testkey2' },
        version: { type: 'number', example: 2 },
      },
    },
  })
  @ApiOkResponse({
    description: 'Delete operation success',
    schema: { example: { success: true } },
  })
  @ApiBadRequestResponse({ description: 'Path or version does not exist' })
  async deleteSecret(@Body() body: { path?: string; version?: number | string }): Promise<{ success: boolean }> {
    await this.secretsService.deleteSecret(body?.path || '', body?.version);
    return { success: true };
  }

}