import { clone } from '../util'

const numberRegex = /^[0-9.]{1,}$/

export default class IrcCommand {
  constructor (command, data) {
    this.command = command += ''
    this.params = clone(data.params)
    this.tags = clone(data.tags)

    this.prefix = data.prefix
    this.nick = data.nick
    this.ident = data.ident
    this.hostname = data.hostname
  }

  getTag (tag_name) {
    return this.tags[tag_name.toLowerCase()]
  }

  getServerTime () {
    const timeTag = this.getTag('time')

    // Explicitly return undefined if theres no time
    // or the value is an empty string
    if (!timeTag) {
      return undefined
    }

    // If parsing fails for some odd reason, also fallback to
    // undefined, instead of returning NaN
    const time = Date.parse(timeTag) || undefined

    // Support for znc.in/server-time unix timestamps
    if (!time && numberRegex.test(timeTag)) {
      return new Date(timeTag * 1000).getTime()
    }

    return time
  }
}
