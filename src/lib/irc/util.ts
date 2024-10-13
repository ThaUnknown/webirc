export const partial = (func, ...boundArgs) => (...remainingArgs) => func(...boundArgs, ...remainingArgs)
export const clone = (obj) => JSON.parse(JSON.stringify(obj))
export const filter = (arr, predicate) => arr.filter(predicate)
export const find = (arr, predicate) => arr.find(predicate)
export const map = (arr, func) => arr.map(func)
export const extend = (obj, ...sources) => Object.assign(obj, ...sources)
export const each = (arr, func) => {
  if (Array.isArray(arr)) {
    arr.forEach(func)
  } else {
    Object.keys(arr).forEach(key => func(arr[key], key))
  }
}
export const pull = function pull (arr, ...removeList) {
  const removeSet = new Set(removeList)
  return arr.filter(function (el) {
    return !removeSet.has(el)
  })
}
export const bind = (fn, target) => fn.bind(target)
export const defer = (fn, ...args) => queueMicrotask(() => fn(...args))
export const uniq = (arr) => [...new Set(arr)]
export const reduce = (arr, func, initial) => arr.reduce(func, initial)
export const intersection = (arr1, arr2) => arr1.filter(value => arr2.includes(value))
export const difference = (arr1, arr2) => arr1.filter(value => !arr2.includes(value))
