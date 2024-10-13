import { each } from '../../util'

const handlers = {
  NOTICE: function (command, handler) {
    const time = command.getServerTime()
    const message = command.params[command.params.length - 1]
    let target = command.params[0]
    let targetGroup

    if ((message.charAt(0) === '\x01') && (message.charAt(message.length - 1) === '\x01')) {
      // It's a CTCP response
      handler.emit('ctcp response', {
        nick: command.nick,
        ident: command.ident,
        hostname: command.hostname,
        target,
        type: (message.substring(1, message.length - 1).split(' ') || [null])[0],
        message: message.substring(1, message.length - 1),
        time,
        tags: command.tags
      })
    } else {
      const parsedTarget = handler.network.extractTargetGroup(target)
      if (parsedTarget) {
        target = parsedTarget.target
        targetGroup = parsedTarget.target_group
      }

      handler.emit('notice', {
        from_server: !command.nick,
        nick: command.nick,
        ident: command.ident,
        hostname: command.hostname,
        target,
        group: targetGroup,
        message,
        tags: command.tags,
        time,
        account: command.getTag('account'),
        batch: command.batch
      })
    }
  },

  PRIVMSG: function (command, handler) {
    const time = command.getServerTime()
    const message = command.params[command.params.length - 1]
    let target = command.params[0]
    let targetGroup

    const parsedTarget = handler.network.extractTargetGroup(target)
    if (parsedTarget) {
      target = parsedTarget.target
      targetGroup = parsedTarget.target_group
    }

    if ((message.charAt(0) === '\x01') && (message.charAt(message.length - 1) === '\x01')) {
      // CTCP request
      const ctcpCommand = message.slice(1, -1).split(' ')[0].toUpperCase()
      if (ctcpCommand === 'ACTION') {
        handler.emit('action', {
          from_server: !command.nick,
          nick: command.nick,
          ident: command.ident,
          hostname: command.hostname,
          target,
          group: targetGroup,
          message: message.substring(8, message.length - 1),
          tags: command.tags,
          time,
          account: command.getTag('account'),
          batch: command.batch
        })
      } else if (ctcpCommand === 'VERSION' && handler.connection.options.version) {
        handler.connection.write(
          'NOTICE ' + command.nick + ' :\x01VERSION ' + handler.connection.options.version + '\x01')
      } else {
        handler.emit('ctcp request', {
          from_server: !command.nick,
          nick: command.nick,
          ident: command.ident,
          hostname: command.hostname,
          target,
          group: targetGroup,
          type: ctcpCommand || null,
          message: message.substring(1, message.length - 1),
          time,
          account: command.getTag('account'),
          tags: command.tags
        })
      }
    } else {
      handler.emit('privmsg', {
        from_server: !command.nick,
        nick: command.nick,
        ident: command.ident,
        hostname: command.hostname,
        target,
        group: targetGroup,
        message,
        tags: command.tags,
        time,
        account: command.getTag('account'),
        batch: command.batch
      })
    }
  },
  TAGMSG: function (command, handler) {
    const time = command.getServerTime()
    const target = command.params[0]
    handler.emit('tagmsg', {
      from_server: !command.nick,
      nick: command.nick,
      ident: command.ident,
      hostname: command.hostname,
      target,
      tags: command.tags,
      time,
      batch: command.batch
    })
  },

  RPL_WALLOPS: function (command, handler) {
    handler.emit('wallops', {
      from_server: false,
      nick: command.nick,
      ident: command.ident,
      hostname: command.hostname,
      message: command.params[command.params.length - 1],
      account: command.getTag('account'),
      tags: command.tags
    })
  }
}

export default function AddCommandHandlers (commandController) {
  each(handlers, function (handler, handlerCommand) {
    commandController.addHandler(handlerCommand, handler)
  })
}
