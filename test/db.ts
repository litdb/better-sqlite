import { connect } from "../src"

export const connection = connect("app.db")
export const { $, sync:db, async, native } = connection