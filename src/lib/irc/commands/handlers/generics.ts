const generics = {
  ERROR: {
    event: 'irc error',
    error: 'irc',
    reason: -1
  },

  ERR_PASSWDMISMATCH: {
    event: 'irc error',
    error: 'password_mismatch'
  },

  ERR_LINKCHANNEL: {
    event: 'channel_redirect',
    from: 1,
    to: 2
  },

  ERR_NOSUCHNICK: {
    event: 'irc error',
    error: 'no_such_nick',
    nick: 1,
    reason: -1
  },

  ERR_NOSUCHSERVER: {
    event: 'irc error',
    error: 'no_such_server',
    server: 1,
    reason: -1
  },

  ERR_CANNOTSENDTOCHAN: {
    event: 'irc error',
    error: 'cannot_send_to_channel',
    channel: 1,
    reason: -1
  },

  ERR_CANNOTSENDTOUSER: {
    event: 'irc error',
    error: 'cannot_send_to_user',
    nick: 1,
    reason: -1
  },

  ERR_TOOMANYCHANNELS: {
    event: 'irc error',
    error: 'too_many_channels',
    channel: 1,
    reason: -1
  },

  ERR_USERNOTINCHANNEL: {
    event: 'irc error',
    error: 'user_not_in_channel',
    nick: 0,
    channel: 1,
    reason: -1
  },

  ERR_NOTONCHANNEL: {
    event: 'irc error',
    error: 'not_on_channel',
    channel: 1,
    reason: -1
  },

  ERR_USERONCHANNEL: {
    event: 'irc error',
    error: 'user_on_channel',
    nick: 1,
    channel: 2
  },

  ERR_CHANNELISFULL: {
    event: 'irc error',
    error: 'channel_is_full',
    channel: 1,
    reason: -1
  },

  ERR_INVITEONLYCHAN: {
    event: 'irc error',
    error: 'invite_only_channel',
    channel: 1,
    reason: -1
  },

  ERR_BANNEDFROMCHAN: {
    event: 'irc error',
    error: 'banned_from_channel',
    channel: 1,
    reason: -1
  },
  ERR_BADCHANNELKEY: {
    event: 'irc error',
    error: 'bad_channel_key',
    channel: 1,
    reason: -1
  },

  ERR_CHANOPRIVSNEEDED: {
    event: 'irc error',
    error: 'chanop_privs_needed',
    channel: 1,
    reason: -1
  },

  ERR_UNKNOWNCOMMAND: {
    event: 'irc error',
    error: 'unknown_command',
    command: 1,
    reason: -1
  },

  ERR_YOUREBANNEDCREEP: {
    event: 'irc error',
    error: 'banned_from_network',
    reason: -1
  },

  ERR_MONLISTFULL: {
    event: 'irc error',
    error: 'monitor_list_full',
    reason: -1
  }
}

const genericKeys = Object.keys(generics)

export default function AddCommandHandlers (commandController) {
  genericKeys.forEach(function (genericCommand) {
    const generic = generics[genericCommand]

    commandController.addHandler(genericCommand, function (command, handler) {
      const eventObj = {}
      const eventKeys = Object.keys(generic)
      let val

      for (let i = 0; i < eventKeys.length; i++) {
        if (eventKeys[i] === 'event') {
          continue
        }

        val = generic[eventKeys[i]]
        if (typeof val === 'string') {
          eventObj[eventKeys[i]] = val
        } else if (val >= 0) {
          eventObj[eventKeys[i]] = command.params[val]
        } else if (val < 0) {
          eventObj[eventKeys[i]] = command.params[command.params.length + val]
        }
      }

      if (eventObj.channel) {
        // Extract the group from any errors targetted towards channels with a statusmsg prefix
        // Eg. @#channel
        const parsed = handler.network.extractTargetGroup(eventObj.channel)
        if (parsed) {
          eventObj.channel = parsed.target
          eventObj.target_group = parsed.target_group
        }
      }

      handler.emit(generic.event, eventObj)
    })
  })
}
