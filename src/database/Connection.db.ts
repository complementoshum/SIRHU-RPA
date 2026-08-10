import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

export interface DbConfig {
  server: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
  };
  connectionTimeout?: number;
  requestTimeout?: number;
  pool?: {
    max: number;
    min: number;
    idleTimeoutMillis: number;
  };
}

export enum DatabaseType {
  SIRHU = 'SIRHU',
  SIAMO = 'SIAMO'
}

export class ConnectionDB {
  private database: DatabaseType;
  private pool: sql.ConnectionPool | null = null;
  private config: sql.config;

  constructor(database: DatabaseType, config?: Partial<DbConfig>) {
    this.database = database;

    const envConfig = this.loadConfigFromEnv();
    const finalConfig = { ...envConfig, ...config };

    this.config = {
      server: finalConfig.server || '',
      port: finalConfig.port || 1433,
      database: finalConfig.database || '',
      user: finalConfig.user || '',
      password: finalConfig.password || '',
      options: {
        encrypt: finalConfig.options?.encrypt ?? false,
        trustServerCertificate: finalConfig.options?.trustServerCertificate ?? true,
      },
      connectionTimeout: finalConfig.connectionTimeout || 30000,
      requestTimeout: finalConfig.requestTimeout || 30000,
      pool: {
        max: finalConfig.pool?.max ?? 10,
        min: finalConfig.pool?.min ?? 0,
        idleTimeoutMillis: finalConfig.pool?.idleTimeoutMillis ?? 30000,
      },
    };
  }

  async connect(): Promise<sql.ConnectionPool> {
    if (!this.pool) {
      this.pool = new sql.ConnectionPool(this.config);
      await this.pool.connect();
    }

    if (!this.pool.connected) {
      await this.pool.connect();
    }

    return this.pool;
  }

  async query<T = unknown>(
    sqlText: string,
    params?: Array<string | number | boolean | Date | null | Buffer>
  ): Promise<T[]> {
    const pool = await this.connect();
    const request = pool.request();

    let queryText = sqlText;

    if (params && params.length > 0) {
      params.forEach((param, index) => {
        const paramName = `param${index}`;
        request.input(paramName, param);
        queryText = queryText.replace('?', `@${paramName}`);
      });
    }

    try {
      const result = await request.query<T>(queryText);
      return result.recordset || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  private loadConfigFromEnv(): Partial<DbConfig> {
    return {
      server: process.env.DB_SERVER,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      database: this.database === DatabaseType.SIRHU ? process.env.APP_DATABASE : process.env.SIAMO_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      },
      connectionTimeout: process.env.DB_CONNECTION_TIMEOUT
        ? parseInt(process.env.DB_CONNECTION_TIMEOUT, 10)
        : undefined,
      requestTimeout: process.env.DB_REQUEST_TIMEOUT
        ? parseInt(process.env.DB_REQUEST_TIMEOUT, 10)
        : undefined,
    };
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`Database error: ${error.message}`);
    }
    return new Error('An unknown database error occurred');
  }
}
