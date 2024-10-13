const slice = [].slice

export default class MiddlewareHandler {
  stack = []

  use (middleware) {
    this.stack.push(middleware)
  }

  clear () {
    this.stack = []
  }

  handle (args, callback) {
    let index = 0
    let length

    if (typeof args === 'function') {
      callback = args
      args = []
    }
    args = args || []

    // Count of arguments a middleware accepts
    length = args.length + 1

    const next = (err) => {
      const middleware = this.stack[index++]
      let _args

      if (arguments.length > 1) {
        // update args by passed values
        args = slice.call(arguments, 1)
        length = args.length + 1
      }

      if (!middleware) {
        if (callback) {
          args.unshift(err)
          callback.apply(null, args)
        }
        return
      }

      _args = args.slice()
      _args.push(next)
      if (middleware.length > length) {
        _args.unshift(err)
      } else if (err) {
        // This middleware can't accept error
        next(err)
        return
      }

      try {
        middleware(..._args)
      } catch (e) {
        next(e)
      }
    }

    next()
  }

  compose (callback) {
    return (...args) => this.handle(slice(...args), callback)
  }
}
