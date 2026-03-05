import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class GenericSecretsService {
  private readonly vaultURL = process.env.VAULT_URL;
  private readonly vaultToken = process.env.VAULT_TOKEN;
  private readonly kvMountPath = process.env.VAULT_KV_MOUNT_PATH || 'tfy-secrets';

  private getVaultConfig() {
    if (!this.vaultURL || !this.vaultToken) {
      throw new HttpException(
        {
          message: 'Vault configuration is missing',
          code: HttpStatus.INTERNAL_SERVER_ERROR,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return {
      url: this.vaultURL.replace(/\/+$/g, ''),
      token: this.vaultToken,
    };
  }

  private parsePath(path: string): { normalizedPath: string; subPath: string } {
    const normalizedPath = path?.trim().replace(/^\/+|\/+$/g, '');
    if (!normalizedPath) {
      throw new HttpException(
        { message: 'path query parameter is required', code: HttpStatus.BAD_REQUEST },
        HttpStatus.BAD_REQUEST,
      );
    }

    const mountPrefix = `${this.kvMountPath}/`;
    if (normalizedPath !== this.kvMountPath && !normalizedPath.startsWith(mountPrefix)) {
      throw new HttpException(
        {
          message: `path must start with ${this.kvMountPath}`,
          code: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const subPath = normalizedPath === this.kvMountPath ? '' : normalizedPath.slice(mountPrefix.length);
    return { normalizedPath, subPath };
  }

  async listSecrets(path: string): Promise<string[]> {
    const { normalizedPath, subPath } = this.parsePath(path);
    const vaultPath = subPath ? `${this.kvMountPath}/metadata/${subPath}` : `${this.kvMountPath}/metadata`;
    const { url, token } = this.getVaultConfig();

    try {
      const response = await fetch(`${url}/v1/${vaultPath}?list=true`, {
        method: 'GET',
        headers: {
        'X-Vault-Token': token,
        },
      });

      if (response.status === HttpStatus.BAD_REQUEST || response.status === HttpStatus.NOT_FOUND) {
        throw new HttpException(
          {
            message: `Directory not found for path ${normalizedPath}`,
            code: HttpStatus.NOT_FOUND,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (!response.ok) {
        throw new HttpException(
          {
            message: 'Error listing secrets',
            code: HttpStatus.INTERNAL_SERVER_ERROR,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const payload = (await response.json()) as { data?: { keys?: string[] } };
      return payload?.data?.keys || [];
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          message: 'Error listing secrets',
          code: HttpStatus.INTERNAL_SERVER_ERROR,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getSecret(path: string, version?: string): Promise<string> {
    const { normalizedPath, subPath } = this.parsePath(path);

    const { url, token } = this.getVaultConfig();
    const headers = {
      'X-Vault-Token': token,
    };

    try {
      const dataPath = `${this.kvMountPath}/data/${subPath}`;
      const versionQuery = version ? `?version=${encodeURIComponent(version)}` : '';
      const response = await fetch(`${url}/v1/${dataPath}${versionQuery}`, {
        method: 'GET',
        headers,
      });

      if (response.ok) {
        const payload = (await response.json()) as { data?: { data?: Record<string, unknown> } };
        const secretData = payload?.data?.data || {};
        if (typeof secretData.value === 'string') {
          return secretData.value;
        }
        const firstValue = Object.values(secretData)[0];
        return typeof firstValue === 'string' ? firstValue : '';
      }

      if (response.status !== HttpStatus.NOT_FOUND && response.status !== HttpStatus.BAD_REQUEST) {
        throw new HttpException(
          {
            message: 'Error getting secret',
            code: HttpStatus.INTERNAL_SERVER_ERROR,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const metadataPath = subPath ? `${this.kvMountPath}/metadata/${subPath}` : `${this.kvMountPath}/metadata`;
      const metadataResponse = await fetch(`${url}/v1/${metadataPath}?list=true`, {
        method: 'GET',
        headers,
      });

      if (metadataResponse.ok) {
        throw new HttpException(
          {
            message: 'path you entered is a director and not a secret',
            code: HttpStatus.BAD_REQUEST,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      throw new HttpException(
        {
          message: `Secret not found for path ${normalizedPath}`,
          code: HttpStatus.NOT_FOUND,
        },
        HttpStatus.NOT_FOUND,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          message: 'Error getting secret',
          code: HttpStatus.INTERNAL_SERVER_ERROR,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createOrUpdateSecret(path: string, value: string): Promise<{ path: string; version: number }> {
    const { normalizedPath, subPath } = this.parsePath(path);
    const secretValue = value ?? '';

    if (!secretValue) {
      throw new HttpException(
        {
          message: 'value is required',
          code: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { url, token } = this.getVaultConfig();
    const headers = {
      'X-Vault-Token': token,
      'Content-Type': 'application/json',
    };

    try {
      const metadataPath = subPath ? `${this.kvMountPath}/metadata/${subPath}` : `${this.kvMountPath}/metadata`;
      const metadataResponse = await fetch(`${url}/v1/${metadataPath}?list=true`, {
        method: 'GET',
        headers: {
          'X-Vault-Token': token,
        },
      });

      if (metadataResponse.ok) {
        throw new HttpException(
          {
            message: `The path ${normalizedPath} is a directory and you cannot create secret at this path`,
            code: HttpStatus.BAD_REQUEST,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const dataPath = `${this.kvMountPath}/data/${subPath}`;
      const writeResponse = await fetch(`${url}/v1/${dataPath}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: {
            value: secretValue,
          },
        }),
      });

      if (!writeResponse.ok) {
        throw new HttpException(
          {
            message: 'Error creating/updating secret',
            code: HttpStatus.INTERNAL_SERVER_ERROR,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const payload = (await writeResponse.json()) as { data?: { version?: number } };
      return {
        path: normalizedPath,
        version: payload?.data?.version || 0,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          message: 'Error creating/updating secret',
          code: HttpStatus.INTERNAL_SERVER_ERROR,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteSecret(path: string, version?: number | string): Promise<void> {
    const { subPath } = this.parsePath(path);

    if (!subPath) {
      throw new HttpException(
        {
          message: 'path or version does not exist',
          code: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { url, token } = this.getVaultConfig();
    const tokenHeaders = {
      'X-Vault-Token': token,
    };

    try {
      const metadataPath = `${this.kvMountPath}/metadata/${subPath}`;
      const metadataResponse = await fetch(`${url}/v1/${metadataPath}`, {
        method: 'GET',
        headers: tokenHeaders,
      });

      if (!metadataResponse.ok) {
        throw new HttpException(
          {
            message: 'path or version does not exist',
            code: HttpStatus.BAD_REQUEST,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (version === undefined || version === null || `${version}`.trim() === '') {
        const deleteResponse = await fetch(`${url}/v1/${metadataPath}`, {
          method: 'DELETE',
          headers: tokenHeaders,
        });

        if (!deleteResponse.ok) {
          throw new HttpException(
            {
              message: 'path or version does not exist',
              code: HttpStatus.BAD_REQUEST,
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        return;
      }

      const parsedVersion = Number(version);

      const metadataPayload = (await metadataResponse.json()) as {
        data?: { versions?: Record<string, unknown> };
      };
      const versions = metadataPayload?.data?.versions || {};
      if (!versions[String(parsedVersion)]) {
        throw new HttpException(
          {
            message: 'path or version does not exist',
            code: HttpStatus.BAD_REQUEST,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const destroyPath = `${this.kvMountPath}/destroy/${subPath}`;
      const destroyResponse = await fetch(`${url}/v1/${destroyPath}`, {
        method: 'POST',
        headers: {
          ...tokenHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          versions: [parsedVersion],
        }),
      });

      if (!destroyResponse.ok) {
        throw new HttpException(
          {
            message: 'path or version does not exist',
            code: HttpStatus.BAD_REQUEST,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          message: 'Error deleting secret',
          code: HttpStatus.INTERNAL_SERVER_ERROR,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}