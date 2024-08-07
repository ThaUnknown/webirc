import { EventEmitter } from 'eventemitter3'

declare module 'irc-framework/src/client.js' {
  export default class Client extends EventEmitter<string | symbol, any> {
    static setDefaultTransport(transport: any): void;
    constructor(options?: any);
    request_extra_caps: any[]
    options: any
    get Message(): any;
    _applyDefaultOptions(user_options: any): any;
    createStructure(): void;
    raw_middleware: any
    parsed_middleware: any
    connection: any
    network: any
    user: any
    command_handler: any
    whox_token: {
        value: number;
        requests: any[];
        next: () => number;
        validate: (token: any) => boolean;
    }

    requestCap(cap: any): void;
    use(middleware_fn: any): this;
    connect(options: any): void;
    proxyIrcEvents(): void;
    addCommandHandlerListeners(): void;
    registerToNetwork(): void;
    startPeriodicPing(): void;
    startPingTimeoutTimer(): void;
    resetPingTimeoutTimer(): void;
    debugOut(out: any): void;
    /**
     * Client API
     */
    raw(input: any, ...args: any[]): void;
    rawString(input: any, ...args: any[]): any;
    quit(message: any): void;
    ping(message: any): void;
    changeNick(nick: any): void;
    sendMessage(commandName: any, target: any, message: any, tags: any): void;
    say(target: any, message: any, tags: any): void;
    notice(target: any, message: any, tags: any): void;
    tagmsg(target: any, tags?: {}): void;
    join(channel: any, key: any): void;
    part(channel: any, message: any): void;
    mode(channel: any, mode: any, extra_args: any): void;
    inviteList(channel: any, cb: any): void;
    invite(channel: any, nick: any): void;
    addInvite(channel: any, mask: any): void;
    removeInvite(channel: any, mask: any): void;
    banlist(channel: any, cb: any): void;
    ban(channel: any, mask: any): void;
    unban(channel: any, mask: any): void;
    setTopic(channel: any, newTopic: any): void;
    ctcpRequest(target: any, type: any, ...args: any[]): void;
    ctcpResponse(target: any, type: any, ...args: any[]): void;
    action(target: any, message: any): any[];
    whois(target: any, _cb: any, ...args: any[]): void;
    whowas(target: any, _cb: any, ...args: any[]): void;
    /**
     * WHO requests are queued up to run serially.
     * This is mostly because networks will only reply serially and it makes
     * it easier to include the correct replies to callbacks
     */
    who(target: any, cb: any): void;
    who_queue: any[]
    monitorlist(cb: any): void;
    addMonitor(target: any): void;
    removeMonitor(target: any): void;
    queryMonitor(): void;
    clearMonitor(): void;
    processNextWhoQueue(): void;
    /**
     * Explicitely start a channel list, avoiding potential issues with broken IRC servers not sending RPL_LISTSTART
     */
    list(...args: any[]): void;
    channel(channel_name: any): any;
    match(match_regex: any, cb: any, message_type: any): {
        stop: () => void;
    };

    matchNotice(match_regex: any, cb: any): {
        stop: () => void;
    };

    matchMessage(match_regex: any, cb: any): {
        stop: () => void;
    };

    matchAction(match_regex: any, cb: any): {
        stop: () => void;
    };

    caseCompare(string1: any, string2: any): boolean;
    caseLower(string: any): string;
    caseUpper(string: any): string;
    _getCaseMappingUpperAsciiBound(): 90 | 93 | 94;
  }
}
