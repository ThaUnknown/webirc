import { Duplex } from 'streamx'
import { partial, filter, find, each, pull, extend } from './util'

export default class IrcChannel {
  ircClient
  name
  say
  notice
  part
  join
  mode
  banlist
  ban
  unban
  users
  constructor (ircClient, channelName, key) {
    this.ircClient = ircClient
    this.name = channelName

    // TODO: Proxy channel related events from irc_bot to this instance

    this.say = partial(ircClient.say.bind(ircClient), channelName)
    this.notice = partial(ircClient.notice.bind(ircClient), channelName)
    // this.action = partial(irc_client.action.bind(irc_client), channel_name);
    this.part = partial(ircClient.part.bind(ircClient), channelName)
    this.join = partial(ircClient.join.bind(ircClient), channelName)
    this.mode = partial(ircClient.mode.bind(ircClient), channelName)
    this.banlist = partial(ircClient.banlist.bind(ircClient), channelName)
    this.ban = partial(ircClient.ban.bind(ircClient), channelName)
    this.unban = partial(ircClient.unban.bind(ircClient), channelName)

    this.users = []
    ircClient.on('userlist', (event) => {
      if (ircClient.caseCompare(event.channel, this.name)) {
        this.users = event.users
      }
    })
    ircClient.on('join', (event) => {
      if (ircClient.caseCompare(event.channel, this.name)) {
        this.users.push(event)
      }
    })
    ircClient.on('part', (event) => {
      if (ircClient.caseCompare(event.channel, this.name)) {
        this.users = filter(this.users, function (o) {
          return !ircClient.caseCompare(event.nick, o.nick)
        })
      }
    })
    ircClient.on('kick', (event) => {
      if (ircClient.caseCompare(event.channel, this.name)) {
        this.users = filter(this.users, function (o) {
          return !ircClient.caseCompare(event.kicked, o.nick)
        })
      }
    })
    ircClient.on('quit', (event) => {
      this.users = filter(this.users, function (o) {
        return !ircClient.caseCompare(event.nick, o.nick)
      })
    })
    ircClient.on('nick', (event) => {
      find(this.users, function (o) {
        if (ircClient.caseCompare(event.nick, o.nick)) {
          o.nick = event.new_nick
          return true
        }
      })
    })
    ircClient.on('mode', (event) => {
      /* event will be something like:
            {
                target: '#prawnsalad',
                nick: 'ChanServ',
                modes: [ { mode: '+o', param: 'prawnsalad' } ],
                time: undefined
            }
            */

      if (!ircClient.caseCompare(event.target, this.name)) {
        return
      }

      // There can be multiple modes set at once, loop through
      each(event.modes, mode => {
        // If this mode has a user prefix then we need to update the user object
        // eg. +o +h +v
        const userPrefix = ircClient.network.options.PREFIX.find(pref => {
          return pref.mode === mode.mode
        })

        if (!userPrefix) {
          // TODO : manage channel mode changes
        } else { // It's a user mode
          // Find the user affected
          const user = find(this.users, u =>
            ircClient.caseCompare(u.nick, mode.param)
          )

          if (!user) {
            return
          }

          if (mode.mode[0] === '+') {
            user.modes = user.modes || []
            user.modes.push(mode.mode[1])
          } else {
            pull(user.modes, mode.mode[1])
          }
        }
      })
    })

    this.join(key)
  }

  /**
     * Relay messages between this channel to another
     * @param  {IrcChannel|String} targetChan Target channel
     * @param  {Object} opts        Extra options
     *
     * opts may contain the following properties:
     * one_way (false) Only relay messages to target_chan, not the reverse
     * replay_nicks (true) Include the sending nick as part of the relayed message
     */
  relay (targetChan, opts) {
    opts = extend({
      one_way: false,
      replay_nicks: true
    }, opts)

    if (typeof targetChan === 'string') {
      targetChan = this.ircClient.channel(targetChan)
    }
    const thisStream = this.stream(opts)
    const otherStream = targetChan.stream(opts)

    thisStream.pipe(otherStream)
    if (!opts.one_way) {
      otherStream.pipe(thisStream)
    }
  }

  stream (streamOpts) {
    const readQueue = []
    let isReading = false

    const stream = new Duplex({
      objectMode: true,

      write: (chunk, encoding, next) => {
        // Support piping from one irc buffer to another
        if (typeof chunk === 'object' && typeof chunk.message === 'string') {
          if (streamOpts.replay_nicks) {
            chunk = '<' + chunk.nick + '> ' + chunk.message
          } else {
            chunk = chunk.message
          }
        }

        this.say(chunk.toString())
        next()
      },

      read: () => {
        isReading = true

        while (readQueue.length > 0) {
          const message = readQueue.shift()
          if (stream.push(message) === false) {
            isReading = false
            break
          }
        }
      }
    })

    this.ircClient.on('privmsg', (event) => {
      if (this.ircClient.caseCompare(event.target, this.name)) {
        readQueue.push(event)

        if (isReading) {
          stream._read()
        }
      }
    })

    return stream
  }

  updateUsers (cb) {
    const updateUserList = (event) => {
      if (this.ircClient.caseCompare(event.channel, this.name)) {
        this.ircClient.removeListener('userlist', updateUserList)
        if (typeof cb === 'function') { cb(this) }
      }
    }

    this.ircClient.on('userlist', updateUserList)
    this.ircClient.raw('NAMES', this.name)
  }
}
