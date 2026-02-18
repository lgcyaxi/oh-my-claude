declare module "sql.js-fts5" {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    create_function(name: string, fn: (...args: any[]) => any): void;
  }

  interface Statement {
    bind(params?: any[] | Record<string, any>): boolean;
    step(): boolean;
    get(params?: any[]): any[];
    getAsObject(params?: Record<string, any>): Record<string, any>;
    free(): boolean;
    reset(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface SqlJsOptions {
    locateFile?: (file: string) => string;
  }

  function initSqlJs(options?: SqlJsOptions): Promise<SqlJsStatic>;
  export default initSqlJs;
}
