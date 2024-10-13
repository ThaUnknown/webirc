import { EventEmitter } from 'events'
import { find, each, defer, bind } from './util.ts'

import MiddlewareHandler from './middlewarehandler.ts'
import { CommandHandler } from './commands'
import IrcMessage from './ircmessage'
import Connection from './connection'
import NetworkInfo from './networkinfo'
import User from './user'
import Channel from './channel'
import lb from './linebreak.ts'
import MessageTags from './messagetags'

const { lineBreak } = lb

let defaultTransport = null

export default class IrcClient extends EventEmitter {
  requestExtraCaps
  options
  rawMiddleware
  parsedMiddleware
  connection
  network
  user
  commandHandler
  whoQueue
  whoxToken
  constructor (options) {
    super()

    this.requestExtraCaps = []
    this.options = options || null

    this.createStructure()
  }

  static setDefaultTransport (transport) {
    defaultTransport = transport
  }

  get Message () {
    return IrcMessage
  }

  _applyDefaultOptions (userOptions) {
    const defaults = {
      nick: 'ircbot',
      username: 'ircbot',
      gecos: 'ircbot',
      encoding: 'utf8',
      version: 'node.js irc-framework',
      enable_chghost: false,
      enable_setname: false,
      enable_echomessage: false,
      auto_reconnect: true,
      auto_reconnect_max_wait: 300000,
      auto_reconnect_max_retries: 3,
      ping_interval: 30,
      ping_timeout: 120,
      message_max_length: 350,
      sasl_disconnect_on_fail: false,
      transport: defaultTransport,
      websocket_protocol: 'text.ircv3.net'
    }

    const props = Object.keys(defaults)
    for (let i = 0; i < props.length; i++) {
      if (typeof userOptions[props[i]] === 'undefined') {
        userOptions[props[i]] = defaults[props[i]]
      }
    }

    return userOptions
  }

  createStructure () {
    // Provides middleware hooks for either raw IRC commands or the easier to use parsed commands
    this.rawMiddleware = new MiddlewareHandler()
    this.parsedMiddleware = new MiddlewareHandler()

    this.connection = new Connection(this.options)
    this.network = new NetworkInfo()
    this.user = new User()

    this.commandHandler = new CommandHandler(this)

    this.addCommandHandlerListeners();

    // Proxy some connection events onto this client
    [
      'connecting',
      'reconnecting',
      'close',
      'socket close',
      'socket error',
      'raw socket connected',
      'debug',
      'raw'
    ].forEach((eventName) => {
      this.connection.on(eventName, (...args) => {
        this.emit(eventName, ...args)
      })
    })

    this.connection.on('socket connected', () => {
      this.emit('socket connected')
      this.registerToNetwork()
      this.startPingTimeoutTimer()
    })

    this.connection.on('connecting', () => {
      // Reset cap negotiation on a new connection
      // This prevents stale state if a connection gets closed during CAP negotiation
      this.network.cap.negotiating = false
      this.network.cap.requested = []
      this.network.cap.enabled = []
      this.network.cap.available.clear()

      this.commandHandler.resetCache()
    })

    // IRC command routing
    this.connection.on('message', (message, rawLine) => {
      this.rawMiddleware.handle([message.command, message, rawLine, this], (err) => {
        if (err) {
          console.log(err.stack)
          return
        }

        this.commandHandler.dispatch(message)
      })
    })

    this.on('registered', () => {
      // PING is not a valid command until after registration
      this.startPeriodicPing()
    })

    this.on('away', (event) => {
      if (this.caseCompare(event.nick, this.user.nick)) {
        this.user.away = true
      }
    })

    this.on('back', (event) => {
      if (this.caseCompare(event.nick, this.user.nick)) {
        this.user.away = false
      }
    })

    // Proxy the command handler events onto the client object, with some added sugar
    this.proxyIrcEvents()

    const whoxToken = {
      value: 0,
      requests: [],
      next: () => {
        if (whoxToken.value >= 999) {
          // whox token is limited to 3 characters
          whoxToken.value = 0
        }
        const token = ++whoxToken.value
        whoxToken.requests.push(token)
        return token
      },
      validate: (token) => {
        const idx = whoxToken.requests.indexOf(token)
        if (idx !== -1) {
          whoxToken.requests.splice(idx, 1)
          return true
        }
        return false
      }
    }
    this.whoxToken = whoxToken

    Object.defineProperty(this, 'connected', {
      enumerable: true,
      get: function () {
        return this.connection && this.connection.connected
      }
    })
  }

  requestCap (cap) {
    this.requestExtraCaps = this.requestExtraCaps.concat(cap)
  }

  use (fn) {
    fn(this, this.rawMiddleware, this.parsedMiddleware)
    return this
  }

  connect (options) {
    // Use the previous options object if we're calling .connect() again
    if (!options && !this.options) {
      throw new Error('Options object missing from IrcClient.connect()')
    } else if (!options) {
      options = this.options
    } else {
      this.options = options
    }

    this._applyDefaultOptions(options)

    if (this.connection && this.connection.connected) {
      this.debugOut('connect() called when already connected')
      this.connection.end()
    }

    this.user.nick = options.nick
    this.user.username = options.username
    this.user.gecos = options.gecos

    this.commandHandler.requestExtraCaps(this.requestExtraCaps)

    // Everything is setup and prepared, start connecting
    this.connection.connect(options)
  }

  // Proxy the command handler events onto the client object, with some added sugar
  // Events are handled in order:
  // 1. Received from the command handler
  // 2. Checked if any extra properties/methods are to be added to the event + re-emitted
  // 3. Routed through middleware
  // 4. Emitted from the client instance
  proxyIrcEvents () {
    this.commandHandler.on('all', (eventName, eventArg) => {
      this.resetPingTimeoutTimer()

      // Add a reply() function to selected message events
      if (['privmsg', 'notice', 'action'].indexOf(eventName) > -1) {
        eventArg.reply = (message) => {
          const dest = eventArg.target === this.user.nick
            ? eventArg.nick
            : eventArg.target

          this.say(dest, message)
        }

        // These events with .reply() function are all messages. Emit it separately
        // TODO: Should this consider a notice a message?
        this.commandHandler.emit('message', { type: eventName, ...eventArg })
      }

      this.parsedMiddleware.handle([eventName, eventArg, this], (err) => {
        if (err) {
          console.error(err.stack)
          return
        }

        this.emit(eventName, eventArg)
      })
    })
  }

  addCommandHandlerListeners () {
    this.commandHandler.on('nick', (event) => {
      if (this.user.nick === event.nick) {
        // nicks starting with numbers are reserved for uuids
        // we dont want to store these as they cannot be used
        if (event.new_nick.match(/^\d/)) {
          return
        }
        this.user.nick = event.new_nick
      }
    })

    this.commandHandler.on('mode', (event) => {
      if (this.user.nick === event.target) {
        event.modes.forEach((mode) => {
          this.user.toggleModes(mode.mode)
        })
      }
    })

    this.commandHandler.on('wholist', (event) => {
      const thisUser = find(event.users, { nick: this.user.nick })
      if (thisUser) {
        this.user.username = thisUser.ident
        this.user.host = thisUser.hostname
      }
    })

    this.commandHandler.on('registered', (event) => {
      this.user.nick = event.nick
      this.connection.registeredSuccessfully()
      this.emit('connected', event)
    })

    this.commandHandler.on('displayed host', (event) => {
      if (this.user.nick === event.nick) {
        this.user.host = event.hostname
      }
    })

    // Don't let IRC ERROR command kill the node.js process if unhandled
    this.commandHandler.on('error', (event) => {
    })
  }

  registerToNetwork () {
    const webirc = this.options.webirc

    if (webirc) {
      let address = String(webirc.address)

      // Prepend a zero to addresses that begin with colon (like ::1)
      // as colon is using to denote last argument in IRC
      if (address[0] === ':') {
        address = '0' + address
      }

      this.raw(
        'WEBIRC',
        webirc.password,
        webirc.username,
        webirc.hostname,
        address,
        MessageTags.encode(webirc.options || {}, ' ')
      )
    }

    this.raw('CAP LS 302')

    if (this.options.password) {
      this.raw('PASS', this.options.password)
    }

    this.raw('NICK', this.user.nick)
    this.raw('USER', this.options.username, 0, '*', this.user.gecos)
  }

  startPeriodicPing () {
    let pingTimer = null

    if (this.options.ping_interval <= 0) {
      return
    }

    const resetPingTimer = () => {
      this.connection.clearTimeout(pingTimer)
      pingTimer = this.connection.setTimeout(() => this.ping(), this.options.ping_interval * 1000)
    }

    // Browsers have started throttling looped timeout callbacks
    // using the pong event to set the next ping breaks this loop
    this.commandHandler.on('pong', resetPingTimer)

    // Socket has disconnected, remove 'pong' listener until next 'registered' event
    this.connection.once('socket close', () => {
      this.commandHandler.off('pong', resetPingTimer)
    })

    // Start timer
    resetPingTimer()
  }

  startPingTimeoutTimer () {
    let timeoutTimer = null

    if (this.options.ping_timeout <= 0) {
      return
    }

    // Data from the server was detected so restart the timeout
    const resetPingTimeoutTimer = () => {
      this.connection.clearTimeout(timeoutTimer)
      timeoutTimer = this.connection.setTimeout(pingTimeout, this.options.ping_timeout * 1000)
    }

    const pingTimeout = () => {
      this.debugOut('Ping timeout (' + this.options.ping_timeout + ' seconds)')
      this.emit('ping timeout')
      this.connection.end(this.rawString('QUIT', 'Ping timeout (' + this.options.ping_timeout + ' seconds)'), true)
    }

    this.resetPingTimeoutTimer = resetPingTimeoutTimer
    this.resetPingTimeoutTimer()
  }

  // Gets overridden with a function in startPeriodicPing(). Only set here for completeness.
  resetPingTimeoutTimer () {}

  debugOut (out) {
    this.emit('debug', 'Client ' + out)
  }

  /**
     * Client API
     */
  raw (...args) {
    if (args[0] instanceof IrcMessage) {
      this.connection.write(args[0].to1459())
    } else {
      this.connection.write(this.rawString(...args))
    }
  }

  rawString (input) {
    let args

    if (input.constructor === Array) {
      args = input
    } else {
      args = Array.prototype.slice.call(arguments, 0)
    }

    args = args.filter(function (item) {
      return (typeof item === 'number' || typeof item === 'string')
    })

    if (args.length > 1 && args[args.length - 1].match(/^:|\s/)) {
      args[args.length - 1] = ':' + args[args.length - 1]
    }

    return args.join(' ')
  }

  quit (message) {
    this.connection.end(this.rawString('QUIT', message))
  }

  ping (message) {
    this.raw('PING', message || Date.now().toString())
  }

  changeNick (nick) {
    this.raw('NICK', nick)
  }

  sendMessage (commandName, target, message, tags) {
    const lines = message
      .split(/\r\n|\n|\r/)
      .filter(i => i)

    lines.forEach(line => {
      // Maximum length of target + message we can send to the IRC server is 500 characters
      // but we need to leave extra room for the sender prefix so the entire message can
      // be sent from the IRCd to the target without being truncated.
      const blocks = [
        ...lineBreak(line, {
          bytes: this.options.message_max_length,
          allowBreakingWords: true,
          allowBreakingGraphemes: true
        })
      ]

      blocks.forEach(block => {
        if (tags && Object.keys(tags).length) {
          const msg = new IrcMessage(commandName, target, block)
          msg.tags = tags
          this.raw(msg)
        } else {
          this.raw(commandName, target, block)
        }
      })
    })
  }

  say (target, message, tags) {
    return this.sendMessage('PRIVMSG', target, message, tags)
  }

  notice (target, message, tags) {
    return this.sendMessage('NOTICE', target, message, tags)
  }

  tagmsg (target, tags = {}) {
    const msg = new IrcMessage('TAGMSG', target)
    msg.tags = tags
    this.raw(msg)
  }

  join (channel, key) {
    const raw = ['JOIN', channel]
    if (key) {
      raw.push(key)
    }
    this.raw(raw)
  }

  part (channel, message) {
    const raw = ['PART', channel]
    if (message) {
      raw.push(message)
    }
    this.raw(raw)
  }

  mode (channel, mode, extraArgs) {
    let raw = ['MODE', channel, mode]

    if (extraArgs) {
      if (Array.isArray(extraArgs)) {
        raw = raw.concat(extraArgs)
      } else {
        raw.push(extraArgs)
      }
    }

    this.raw(raw)
  }

  inviteList (channel, cb) {
    const client = this
    const invex = this.network.supports('INVEX')
    let mode = 'I'

    if (typeof invex === 'string' && invex) {
      mode = invex
    }

    function onInviteList (event) {
      if (client.caseCompare(event.channel, channel)) {
        unbindEvents()
        if (typeof cb === 'function') {
          cb(event)
        }
      }
    }

    function onInviteListErr (event) {
      if (event.error === 'chanop_privs_needed') {
        unbindEvents()
        if (typeof cb === 'function') {
          cb(null)
        }
      }
    }

    function bindEvents () {
      client.on('inviteList', onInviteList)
      client.on('irc error', onInviteListErr)
    }

    function unbindEvents () {
      client.removeListener('inviteList', onInviteList)
      client.removeListener('irc error', onInviteListErr)
    }

    bindEvents()
    this.raw(['MODE', channel, mode])
  }

  invite (channel, nick) {
    const raw = ['INVITE', nick, channel]
    this.raw(raw)
  }

  addInvite (channel, mask) {
    let mode = 'I'
    const invex = this.network.supports('INVEX')
    if (typeof invex === 'string') {
      mode = invex
    }

    const raw = ['MODE', channel, '+' + mode, mask]
    this.raw(raw)
  }

  removeInvite (channel, mask) {
    let mode = 'I'
    const invex = this.network.supports('INVEX')
    if (typeof invex === 'string') {
      mode = invex
    }

    const raw = ['MODE', channel, '-' + mode, mask]
    this.raw(raw)
  }

  banlist (channel, cb) {
    const client = this
    const raw = ['MODE', channel, 'b']

    this.on('banlist', function onBanlist (event) {
      if (client.caseCompare(event.channel, channel)) {
        client.removeListener('banlist', onBanlist)
        if (typeof cb === 'function') {
          cb(event)
        }
      }
    })

    this.raw(raw)
  }

  ban (channel, mask) {
    const raw = ['MODE', channel, '+b', mask]
    this.raw(raw)
  }

  unban (channel, mask) {
    const raw = ['MODE', channel, '-b', mask]
    this.raw(raw)
  }

  setTopic (channel, newTopic) {
    this.raw('TOPIC', channel, newTopic)
  }

  ctcpRequest (target, type /*, paramN */) {
    const params = Array.prototype.slice.call(arguments, 1)

    // make sure the CTCP type is uppercased
    params[0] = params[0].toUpperCase()

    this.raw(
      'PRIVMSG',
      target,
      String.fromCharCode(1) + params.join(' ') + String.fromCharCode(1)
    )
  }

  ctcpResponse (target, type /*, paramN */) {
    const params = Array.prototype.slice.call(arguments, 1)

    // make sure the CTCP type is uppercased
    params[0] = params[0].toUpperCase()

    this.raw(
      'NOTICE',
      target,
      String.fromCharCode(1) + params.join(' ') + String.fromCharCode(1)
    )
  }

  action (target, message) {
    // Maximum length of target + message we can send to the IRC server is 500 characters
    // but we need to leave extra room for the sender prefix so the entire message can
    // be sent from the IRCd to the target without being truncated.

    // The block length here is the max, but without the non-content characters:
    // the command name, the space, and the two SOH chars

    const commandName = 'ACTION'
    const blockLength = this.options.message_max_length - (commandName.length + 3)
    const blocks = [...lineBreak(message, { bytes: blockLength, allowBreakingWords: true, allowBreakingGraphemes: true })]

    blocks.forEach((block) => {
      this.ctcpRequest(target, commandName, block)
    })

    return blocks
  }

  whois (target, _cb) {
    const client = this
    let cb
    const irc_args = ['WHOIS']

    // Support whois(target, arg1, arg2, argN, cb)
    each(arguments, function (arg) {
      if (typeof arg === 'function') {
        cb = arg
      } else {
        irc_args.push(arg)
      }
    })

    this.on('whois', function onWhois (event) {
      if (client.caseCompare(event.nick, target)) {
        client.removeListener('whois', onWhois)
        if (typeof cb === 'function') {
          cb(event)
        }
      }
    })

    this.raw(irc_args)
  }

  whowas (target, _cb) {
    const client = this
    let cb
    const ircArgs = ['WHOWAS']

    // Support whowas(target, arg1, arg2, argN, cb)
    each(arguments, function (arg) {
      if (typeof arg === 'function') {
        cb = arg
      } else {
        ircArgs.push(arg)
      }
    })

    this.on('whowas', function onWhowas (event) {
      if (client.caseCompare(event.nick, target)) {
        client.removeListener('whowas', onWhowas)
        if (typeof cb === 'function') {
          cb(event)
        }
      }
    })

    this.raw(ircArgs)
  }

  /**
     * WHO requests are queued up to run serially.
     * This is mostly because networks will only reply serially and it makes
     * it easier to include the correct replies to callbacks
     */
  who (target, cb) {
    if (!this.whoQueue) {
      this.whoQueue = []
    }
    this.whoQueue.push([target, cb])
    this.processNextWhoQueue()
  }

  monitorlist (cb) {
    const client = this
    const raw = ['MONITOR', 'L']

    this.on('monitorList', function onMonitorlist (event) {
      client.removeListener('monitorList', onMonitorlist)
      if (typeof cb === 'function') {
        cb(event)
      }
    })

    this.raw(raw)
  }

  addMonitor (target) {
    const raw = ['MONITOR', '+', target]

    this.raw(raw)
  }

  removeMonitor (target) {
    const raw = ['MONITOR', '-', target]

    this.raw(raw)
  }

  queryMonitor () {
    const raw = ['MONITOR', 'S']

    this.raw(raw)
  }

  clearMonitor () {
    const raw = ['MONITOR', 'C']

    this.raw(raw)
  }

  processNextWhoQueue () {
    // No items in the queue or the queue is already running?
    if (this.whoQueue.length === 0 || this.whoQueue.is_running) {
      return
    }

    this.whoQueue.is_running = true

    const thisWho = this.whoQueue.shift()
    const target = thisWho[0]
    const cb = thisWho[1]

    if (!target || typeof target !== 'string') {
      if (typeof cb === 'function') {
        defer(cb, {
          target,
          users: []
        })
      }

      // Start the next queued WHO request
      this.whoQueue.is_running = false
      defer(bind(this.processNextWhoQueue, this))

      return
    }
    const client = this
    this.on('wholist', function onWho (event) {
      client.removeListener('wholist', onWho)

      // Start the next queued WHO request
      client.whoQueue.is_running = false
      defer(bind(client.processNextWhoQueue, client))

      if (typeof cb === 'function') {
        cb({
          target,
          users: event.users
        })
      }
    })

    if (this.network.supports('whox')) {
      const token = this.whoxToken.next()
      this.raw('WHO', target, `%tcuhsnfdaor,${token}`)
    } else {
      this.raw('WHO', target)
    }
  }

  /**
     * Explicitely start a channel list, avoiding potential issues with broken IRC servers not sending RPL_LISTSTART
     */
  list (...args) {
    this.commandHandler.cache('chanlist').channels = []
    args.unshift('LIST')
    this.raw(args)
  }

  channel (channelName) {
    return new Channel(this, channelName)
  }

  match (matchRegex, cb, messageType) {
    const client = this

    const onMessage = (event) => {
      if (event.message.match(matchRegex)) {
        cb(event)
      }
    }

    this.on(messageType || 'message', onMessage)

    return {
      stop: function () {
        client.removeListener(messageType || 'message', onMessage)
      }
    }
  }

  matchNotice (matchRegex, cb) {
    return this.match(matchRegex, cb, 'notice')
  }

  matchMessage (matchRegex, cb) {
    return this.match(matchRegex, cb, 'privmsg')
  }

  matchAction (matchRegex, cb) {
    return this.match(matchRegex, cb, 'action')
  }

  caseCompare (string1, string2) {
    const length = string1.length

    if (length !== string2.length) {
      return false
    }

    const upperBound = this._getCaseMappingUpperAsciiBound()

    for (let i = 0; i < length; i++) {
      let charCode1 = string1.charCodeAt(i)
      let charCode2 = string2.charCodeAt(i)

      if (charCode1 >= 65 && charCode1 <= upperBound) {
        charCode1 += 32
      }

      if (charCode2 >= 65 && charCode2 <= upperBound) {
        charCode2 += 32
      }

      if (charCode1 !== charCode2) {
        return false
      }
    }

    return true
  }

  caseLower (string) {
    const upperBound = this._getCaseMappingUpperAsciiBound()
    let result = ''

    for (let i = 0; i < string.length; i++) {
      const charCode = string.charCodeAt(i)

      // ASCII character from 'A' to upper bound defined above
      if (charCode >= 65 && charCode <= upperBound) {
        // All the relevant uppercase characters are exactly
        // 32 bytes apart from lowercase ones, so we simply add 32
        // and get the equivalent character in lower case
        result += String.fromCharCode(charCode + 32)
      } else {
        result += string[i]
      }
    }

    return result
  }

  caseUpper (string) {
    const upperBound = this._getCaseMappingUpperAsciiBound() + 32
    let result = ''

    for (let i = 0; i < string.length; i++) {
      const charCode = string.charCodeAt(i)

      // ASCII character from 'a' to upper bound defined above
      if (charCode >= 97 && charCode <= upperBound) {
        // All the relevant lowercase characters are exactly
        // 32 bytes apart from lowercase ones, so we simply subtract 32
        // and get the equivalent character in upper case
        result += String.fromCharCode(charCode - 32)
      } else {
        result += string[i]
      }
    }

    return result
  }

  _getCaseMappingUpperAsciiBound () {
    if (this.network.options.CASEMAPPING === 'ascii') {
      return 90 // 'Z'
    } else if (this.network.options.CASEMAPPING === 'strict-rfc1459') {
      return 93 // ']'
    }

    return 94 // '^' - default casemapping=rfc1459
  }
}
