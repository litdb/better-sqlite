import { connect } from "../src"

export const connection = connect("app.db")
export const { $, async, sync } = connection