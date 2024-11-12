# better-sqlite

litdb driver for [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## Install

```sh
node install @litdb/better-sqlite
```

## Usage

**db.ts**

```ts
import { connect } from "@litdb/better-sqlite"

export const connection = connect("app.db")
export const { $, async, sync } = connection
```

> WAL is enabled by default

**app.ts**

```ts
import { $, sync as db } from "./db"
import { Contact } from "./models"

db.dropTable(Contact)
db.createTable(Contact)
db.insertAll([
    new Contact({ name:"John Doe", email:"john@email.org" }),
    new Contact({ name:"Jane Doe", email:"jane@email.org" }),
])

const janeEmail = 'jane@email.org'
const jane = db.one<Contact>($.from(Contact).where(c => $`${c.email} = ${janeEmail}`))!

// Insert examples
const {lastInsertRowid:bobId} = db.insert(new Contact({ name:"Bob", email:"bob@mail.org" }))
const {lastInsertRowid} = db.exec`INSERT INTO Contact(name,email) VALUES('Jo','jo@doe.io')`
const name = 'Alice', email = 'alice@email.org'
db.exec`INSERT INTO Contact(name,email) VALUES (${name}, ${email})`

// Typed SQL fragment example
const hasId = <Table extends { id:number }>(id:number) =>
    (x:Table) => $.sql($`${x.id} = $id`, { id })

const contacts = db.all($.from(Contact).into(Contact))                // => Contact[]
const bob = db.one($.from(Contact).where(hasId(bobId)).into(Contact)) // => Contact
const contactsCount = db.value($.from(Contact).select`COUNT(*)`)      // => number
const emails = db.column($.from(Contact).select(c => $`${c.email}`))  // => string[]
const contactsArray = db.arrays($.from(Contact))                      // => any[][]
const bobArray = db.array($.from(Contact).where(hasId(bobId)))        // => any[]

// Update examples
jane.email = 'jane@doe.org'
db.update(jane)                           // Update all properties
db.update(jane, { onlyProps:['email'] })  // Update only email
db.exec($.update(Contact).set({ email:jane.email }).where(hasId(jane.id))) // query builder

// Delete examples
db.delete(jane)
db.exec($.deleteFrom(Contact).where(hasId(jane.id))) // query builder
```

Website: https://litdb.dev
