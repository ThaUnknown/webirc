import Client from 'irc-framework/src/client.js'
import { EventEmitter } from 'eventemitter3'
import { createChannelConstructor } from './serverConnection.ts'
import { writable } from 'simple-store-svelte'

type User = { nick: string, ident: string, hostname: string, modes: string[], tags: object }
type PrivMessage = {
  from_server: boolean,
  nick: string,
  ident: string,
  hostname: string,
  target: string,
  message: string,
  tags: {
    msgid: string,
    time: string
  },
  time: number
}

export default class MessageClient extends EventEmitter {
  irc = new Client()
  users = writable<Record<string, User>>({})
  messages = writable<PrivMessage[]>([])
  channel: any

  constructor () {
    super()
    this.irc.on('userlist', ({ users }: { users: User[] }) => {
      this.users.value = users.reduce((acc, user) => {
        acc[user.ident] = user
        return acc
      }, {} as Record<string, User>)
    })

    this.irc.on('join', (user: User) => {
      this.users.value[user.ident] = user
      this.users.update(users => users)
    })

    const deleteUser = (user: User) => {
      delete this.users.value[user.ident]
      this.users.update(users => users)
    }
    this.irc.on('quit', deleteUser)
    this.irc.on('part', deleteUser)
    this.irc.on('kick', deleteUser)

    this.irc.on('privmsg', (message: PrivMessage) => this.messages.update(messages => [...messages, message]))
  }

  say (message: string) {
    this.channel.say(message)
    this.messages.update(messages => [...messages, {
      from_server: false,
      nick: this.irc.user.nick,
      ident: this.irc.user.username,
      hostname: 'LOCAL.IP',
      target: this.channel.name,
      message,
      tags: { msgid: crypto.randomUUID(), time: new Date().toISOString() },
      time: new Date().getTime()
    }])
  }

  static async new (ident: string) {
    const client = new this()

    await new Promise(resolve => {
      client.irc.once('connected', resolve)
      client.irc.connect({
        version: null,
        enable_chghost: true,
        enable_setname: true,
        message_max_length: 350,
        host: 'irc.swiftirc.net',
        port: 5004,
        tls: true,
        path: '',
        password: '',
        account: {},
        nick: ident,
        username: ident,
        gecos: 'https://kiwiirc.com/',
        encoding: 'utf8',
        auto_reconnect: false,
        transport: createChannelConstructor('https://do-e.clients.kiwiirc.com/webirc/kiwiirc/', '', 1)
      })
    })

    await new Promise(resolve => {
      client.irc.once('join', resolve)
      client.channel = client.irc.channel('#4e63ad91532eb8849330')
    })
    return client
  }
}
