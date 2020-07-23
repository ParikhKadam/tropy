'use strict'

const assert = require('assert')
const { unlink } = require('fs').promises
const { call, select } = require('redux-saga/effects')
const { Command } = require('./command')
const { CACHE } = require('../constants')
const { Cache } = require('../common/cache')
const { get } = require('../common/util')
const { debug, info, warn } = require('../common/log')

const UUID = /^[0-9a-f]{8}(-[0-9a-f]+){4}$/i

class Prune extends Command {
  static check(file, state) {
    let [id,, ext] = Cache.split(file)
    return ext !== Cache.extname() ||
      !((id in state.photos || (id in state.selections)))
  }

  *exec() {
    let { cache } = this.options

    let state = yield select()
    let stale = []

    assert(state.photos != null && state.selections != null,
     'cannot prune project cache without state')

    info(`pruning cache ${cache.name}`)
    let files = yield call(cache.list)

    for (let file of files) {
      try {
        if (!Prune.check(file, state)) continue

        debug(`removing ${file}`)
        yield call(unlink, cache.expand(file))
        stale.push(file)

      } catch (e) {
        warn({ stack: e.stack }, `prune: failed removing ${file}`)
      }
    }

    if (stale.length) {
      info(`cleared ${stale.length} file(s) from cache`)
    }

    return stale
  }
}

Prune.register(CACHE.PRUNE)


class Purge extends Command {
  *exec() {
    let AGE = 3 // months
    let NOW = new Date()

    let state = yield select()
    let cache = new Cache(ARGS.cache)
    let stale = []

    let exists = yield call(cache.exists)

    assert(exists, 'cache doese not exist')
    assert(state.recent != null, 'cannot purge caches without state')

    info(`purging cache ${cache.root}`)
    let stats = yield call(cache.stats)

    for (let [id, stat] of stats) {
      if (!stat.isDirectory()) continue
      if (!UUID.test(id)) continue

      let timestamp = get(state.recent, [id, 'opened'], stat.ctimeMs)
      assert(timestamp > 0, 'invalid cache directory timestamp')

      let date = addMonths(AGE, new Date(timestamp))
      if (date > NOW) continue

      info(`removing old project cache ${id}`)
      yield call(unlink, cache.expand(id))
      stale.push(id)
    }

    return stale
  }
}

Purge.register(CACHE.PURGE)

const addMonths = (k = 0, d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + k, d.getDate())


module.exports = {
  Prune,
  Purge
}
