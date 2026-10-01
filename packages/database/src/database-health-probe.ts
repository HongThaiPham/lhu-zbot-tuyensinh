export interface RawQueryable {
  $queryRawUnsafe<T>(query: string): Promise<T>;
}

export interface DatabaseHealthDetails {
  readonly connectionReady: boolean;
  readonly schemaReady: boolean;
  readonly reason?: 'connection_failed' | 'schema_not_migrated';
}

export interface DatabaseHealthResult {
  readonly ready: boolean;
  readonly details: DatabaseHealthDetails;
}

interface SchemaTableRow {
  table_name: string | null;
}

export class DatabaseHealthProbe {
  private readonly prismaClient: RawQueryable;

  public constructor(prismaClient: RawQueryable) {
    this.prismaClient = prismaClient;
  }

  public async checkReadiness(): Promise<DatabaseHealthResult> {
    try {
      await this.prismaClient.$queryRawUnsafe('SELECT 1');

      const tableRows = await this.prismaClient.$queryRawUnsafe<SchemaTableRow[]>(
        "SELECT to_regclass('public.system_metadata')::text AS table_name",
      );

      const schemaReady = Array.isArray(tableRows) && tableRows[0]?.table_name === 'system_metadata';
      if (!schemaReady) {
        return {
          ready: false,
          details: {
            connectionReady: true,
            schemaReady: false,
            reason: 'schema_not_migrated',
          },
        };
      }

      return {
        ready: true,
        details: {
          connectionReady: true,
          schemaReady: true,
        },
      };
    } catch {
      return {
        ready: false,
        details: {
          connectionReady: false,
          schemaReady: false,
          reason: 'connection_failed',
        },
      };
    }
  }
}
