import Database, { Statement as DriverStatement } from "better-sqlite3"
import type { 
    Driver, Connection, SyncConnection, DbBinding, Statement, TypeConverter, Fragment, SyncStatement, Dialect,
    Changes, Constructor, ClassParam, SqlBuilder,
} from "litdb"
import { 
    Sql, DbConnection, NamingStrategy, SyncDbConnection, DefaultValues, converterFor, DateTimeConverter, 
    DialectTypes, SqliteDialect, SqliteTypes, DefaultStrategy, Schema, IS, SqliteSchema,
    toStr,
} from "litdb"

const ENABLE_WAL = "PRAGMA journal_mode = WAL;"

type ConnectionOptions = {
    /**
     * Creates a new database connection to the specified SQLite DB. If the database file does not exist, it is created.
     * @default "app.db"
     */
    fileName?:string
    /**
     * Whether to enable WAL
     * @default true
     */
    wal?:boolean
    /**
     * Open the database as read-only (no write operations, no create).
     * @default false
     */
    readonly?: boolean
    /**
     * If the database does not exist, an Error will be thrown instead of creating a new file
     */
    fileMustExist?: boolean | undefined;
    /**
     * The number of milliseconds to wait when executing queries on a locked database, before throwing a SQLITE_BUSY error
     * @default 5000
     */
    timeout?: number | undefined;
    /**
     * Provide a function that gets called with every SQL string executed by the database connection
     */
    verbose?: ((message?: unknown, ...additionalArgs: unknown[]) => void) | undefined;
    /**
     * If you're using a complicated build system that moves, transforms, or concatenates your JS files, 
     * you can solve it by using this option to provide the file path of better_sqlite3.node (relative to the current working directory).
     */
    nativeBinding?: string | undefined;
}

type DbStamentType<ParamsType,T> = ParamsType extends unknown[] 
    ? Database.Statement<ParamsType, T> 
    : Database.Statement<[ParamsType], T>

/**
 * Create a better-sqlite3 SqliteDriver with the specified connection options
 */
export function connect(options?:ConnectionOptions|string) {
    if (typeof options == 'string') {
        const db = new Database(options, {})
        db.exec(ENABLE_WAL)
        return new SqliteConnection(db, new Sqlite())
    }

    options = options || {}
    if (options.wal !== false) options.wal = true 
    
    const db = new Database(options.fileName ?? "app.db", options)
    if (options?.wal === false) {
        db.exec(ENABLE_WAL)
    }
    return new SqliteConnection(db, new Sqlite())
}

class SqliteStatement<RetType, ParamsType extends DbBinding[]>
    implements Statement<RetType, ParamsType>, SyncStatement<RetType, ParamsType>
{
    native: DriverStatement<ParamsType, RetType>
    _as:RetType|undefined

    constructor(statement: DbStamentType<ParamsType,RetType>) {
        this.native = statement
    }

    result(o:any) {
        return this._as && IS.obj(o) 
            ? new (this._as as Constructor<any>)(o) 
            : o == null
                ? null
                : o
    }

    as<T extends Constructor<any>>(t:T) {
        const clone = new SqliteStatement<T,ParamsType>(this.native as any)
        clone._as = t
        return clone as any as SqliteStatement<T,ParamsType>
    }

    all(...params: ParamsType): Promise<RetType[]> {
        return Promise.resolve(this.native.all(...params).map(x => this.result(x)))
    }
    allSync(...params: ParamsType): RetType[] {
        return this.native.all(...params).map(x => this.result(x))
    }
    one(...params: ParamsType): Promise<RetType | null> {
        return Promise.resolve(this.oneSync(...params)) as any
    }
    oneSync(...params: ParamsType): RetType | null {
        return this.result(this.native.get(...params))
    }

    column<ReturnValue>(...params: ParamsType): Promise<ReturnValue[]> {
        return Promise.resolve(this.arraysSync(...params).map(row => row[0] as ReturnValue))
    }
    columnSync<ReturnValue>(...params: ParamsType): ReturnValue[] {
        return this.arraysSync(...params).map(row => row[0] as ReturnValue)
    }

    value<ReturnValue>(...params: ParamsType): Promise<ReturnValue | null> {
        return Promise.resolve(this.arraysSync(...params).map((row:any) => row[0] as ReturnValue)?.[0] ?? null)
    }
    valueSync<ReturnValue>(...params: ParamsType): ReturnValue | null {
        return this.arraysSync(...params).map(row => row[0] as ReturnValue)?.[0] ?? null
    }

    asRaw<T>(fn:() => T) {
        this.native.raw(true)
        const ret = fn()
        this.native.raw(false)
        return ret
    }

    arrays(...params: ParamsType): Promise<any[][]> {
        return Promise.resolve(this.asRaw(() => this.native.all(...params)) as any[][])
    }
    arraysSync(...params: ParamsType): any[][] {
        return this.asRaw(() => this.native.all(...params)) as any[][]
    }
    array(...params: ParamsType): Promise<any[] | null> {
        return Promise.resolve(this.asRaw(() => this.native.get(...params) ?? null)) as Promise<any[] | null>
    }
    arraySync(...params: ParamsType): any[] | null {
        return (this.asRaw(() => this.native.get(...params) ?? null)) as any[] | null
    }

    exec(...params: ParamsType): Promise<Changes> {
        // console.log('params',params)
        return Promise.resolve(this.native.run(...params))
    }
    execSync(...params: ParamsType): Changes {
        // console.log('params',params)
        const ret = this.native.run(...params)
        // console.log('ret',ret)
        return ret
    }

    run(...params: ParamsType): Promise<void> {
        return Promise.resolve(this.native.run(...params)).then(x => undefined)
    }
    runSync(...params: ParamsType):void {
        this.native.run(...params)
    }
}

export class Sqlite implements Driver
{
    name: string
    dialect:Dialect
    schema:Schema
    $:ReturnType<typeof Sql.create>
    strategy:NamingStrategy = new DefaultStrategy()
    variables: { [key: string]: string } = {
        [DefaultValues.NOW]: 'CURRENT_TIMESTAMP',
        [DefaultValues.MAX_TEXT]: 'TEXT',
        [DefaultValues.MAX_TEXT_UNICODE]: 'TEXT',
        [DefaultValues.TRUE]: '1',
        [DefaultValues.FALSE]: '0',
    }
    types: DialectTypes

    converters: { [key: string]: TypeConverter } = {
        ...converterFor(new DateTimeConverter, "DATE", "DATETIME", "TIMESTAMP", "TIMESTAMPZ"),
    }

    constructor() {
        this.dialect = new SqliteDialect()
        this.$ = this.dialect.$
        this.name = this.constructor.name
        this.schema = this.$.schema = new SqliteSchema(this)
        this.types = new SqliteTypes()
    }
}

export class SqliteConnection implements Connection, SyncConnection {
    $:ReturnType<typeof Sql.create>
    async: DbConnection
    sync: SyncDbConnection
    schema: Schema
    dialect: Dialect

    constructor(public native:Database.Database, public driver:Driver & {
        $:ReturnType<typeof Sql.create>
    }) {
        this.$ = driver.$
        this.schema = this.$.schema = driver.schema
        this.dialect = driver.dialect
        this.async = new SqliteDbConnection(this)
        this.sync = new SqliteSyncDbConnection(this)
    }

    prepare<ReturnType, ParamsType extends DbBinding[]>(sql:TemplateStringsArray|string, ...params: DbBinding[])
        : Statement<ReturnType, ParamsType extends any[] ? ParamsType : [ParamsType]> {
        if (IS.tpl(sql)) {
            let sb = ''
            for (let i = 0; i < sql.length; i++) {
                sb += sql[i]
                if (i < params.length) {
                    sb += `?${i+1}`
                }
            }
            return new SqliteStatement(this.native.prepare<ParamsType, ReturnType>(sb))
        } else {
            return new SqliteStatement(this.native.prepare<ParamsType, ReturnType>(sql))
        }
    }

    prepareSync<RetType, ParamsType extends DbBinding[]>(sql:TemplateStringsArray|string, ...params: DbBinding[])
        : SyncStatement<RetType, ParamsType extends any[] ? ParamsType : [ParamsType]> {
        if (IS.tpl(sql)) {
            let sb = ''
            for (let i = 0; i < sql.length; i++) {
                sb += sql[i]
                if (i < params.length) {
                    sb += `?${i+1}`
                }
            }
            return new SqliteStatement(this.native.prepare<any,ParamsType>(sb) as any)
        } else {
            return new SqliteStatement(this.native.prepare<any,ParamsType>(sql) as any)
        }
    }

    close() { 
        this.native.close()
        return Promise.resolve() 
    }

    closeSync() {
        this.native.close()
    }
}

class SqliteDbConnection extends DbConnection {
    createTable<Table extends ClassParam>(table:Table) {
        return Promise.resolve(this.sync.createTable<Table>(table))
    }
}
class SqliteSyncDbConnection extends SyncDbConnection {
    get db() { return (this.connection as SqliteConnection).native }

    prepareSync<T>(str: TemplateStringsArray | SqlBuilder | Fragment, ...params: any[]) 
        : [SyncStatement<T,DbBinding[]>|SyncStatement<T,any>, any[]|Record<string,any>, T|undefined]
    {
        if (IS.tpl(str)) {
            // better sqlite doesn't support templated string so convert into positional parameters
            const sql = str.join(' ? ')
            let stmt = this.connection.prepareSync<T,DbBinding[]>(sql, ...params)
            // console.log('tpl', stmt, strings, params)
            return [stmt, params, undefined]
        } else if (IS.obj(str)) {
            if ("build" in str) {
                let query = str.build()
                let stmt = this.connection.prepareSync<T,any>(query.sql)
                // console.log('build', stmt, query.params)
                return [stmt, query.params ?? {}, (query as any).into as T]
            } else if ("sql" in str) {
                let sql = str.sql
                let params = (str as any).params ?? {}
                let stmt = this.connection.prepareSync<T,any>(sql)
                return [stmt, params, (str as any).into as T]
            }
        }
        else if (IS.str(str)) {
            let stmt = this.connection.prepareSync<T,DbBinding[]>(str, ...params)
            return [stmt, params, undefined]
        }
        throw new Error(`Invalid argument: ${toStr(str)}`)
    }
    
    createTable<Table extends ClassParam>(table:Table) {
        this.db.exec(this.schema.createTable(table))
        return { changes:0, lastInsertRowid:0 }
    }
}
