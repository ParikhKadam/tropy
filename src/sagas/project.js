'use strict'

const assert = require('assert')
const { OPEN, CLOSE, CLOSED, MIGRATIONS } = require('../constants/project')
const { Database } = require('../common/db')
const { Cache } = require('../common/cache')
const { warn, debug, verbose } = require('../common/log')
const { ipc } = require('./ipc')
const { history } = require('./history')
const { search, load } = require('./search')
const { ontology } = require('./ontology')
const { exec } = require('./cmd')
const { shell } = require('./shell')
const { fail } = require('../dialog')
const mod = require('../models')
const act = require('../actions')
const storage = require('./storage')
const { onErrorPut } = require('./db')

const {
  all, fork, cancel, call, put, take, takeEvery: every, race
} = require('redux-saga/effects')

const { delay } = require('redux-saga')

const has = (condition) => (({ error, meta }) =>
  (!error && meta && (!meta.cmd || meta.done) && meta[condition]))

const command = ({ error, meta }) =>
  (!error && meta && meta.cmd === 'project')

const onErrorClose = onErrorPut(act.project.close)


function *open(file) {
  try {
    var db = new Database(file, 'w')

    yield fork(onErrorClose, db)
    yield call(db.migrate, MIGRATIONS)

    const project = yield call(mod.project.load, db)
    const access = yield call(mod.access.open, db)

    assert(project != null && project.id != null, 'invalid project')

    // Update window's global ARGS to allow reloading the project!
    if (db.path !== ARGS.file) {
      ARGS.file = db.path
      window.location.hash = encodeURIComponent(JSON.stringify(ARGS))
    }

    const cache = new Cache(ARGS.cache, project.id)
    yield call([cache, cache.init])

    yield put(act.project.opened({ file: db.path, ...project }))

    try {
      yield fork(setup, db, project)

      while (true) {
        const action = yield take(command)
        yield fork(exec, { db, id: project.id, cache }, action)
      }

    } finally {
      yield call(close, db, project, access)
    }
  } catch (error) {
    warn(`unexpected error in *open: ${error.message}`)
    debug(error.stack)

    yield call(fail, error, db.path)

  } finally {
    yield call(db.close)
    yield put(act.project.closed())

    verbose('*open terminated')
  }
}


function *setup(db, project) {
  yield every(has('search'), search, db)
  yield every(has('load'), load)

  yield all([
    call(storage.restore, 'nav', project.id),
    call(storage.restore, 'columns', project.id)
  ])

  yield all([
    put(act.history.drop()),
    put(act.list.load()),
    put(act.tag.load())
  ])

  yield call(search, db)
  yield call(load, db)
}


function *close(db, project, access) {
  if (access != null && access.id > 0) {
    yield call(mod.access.close, db, access.id)
  }

  yield all([
    call(mod.item.prune, db),
    call(mod.list.prune, db),
    call(mod.value.prune, db),
    call(mod.photo.prune, db),
    call(mod.selection.prune, db),
    call(mod.note.prune, db),
    call(mod.access.prune, db)
  ])

  yield all([
    call(storage.persist, 'nav', project.id),
    call(storage.persist, 'columns', project.id)
  ])
}


function *main() {
  let task
  let aux

  try {
    aux = yield all([
      fork(ontology),
      fork(ipc),
      fork(history),
      fork(shell),
      fork(storage.start)
    ])

    yield all([
      call(storage.restore, 'settings'),
      call(storage.restore, 'ui')
    ])

    while (true) {
      const { type, payload, error } = yield take([OPEN, CLOSE])

      if (task != null && task.isRunning()) {
        yield cancel(task)
        yield race({
          closed: take(CLOSED),
          timeout: call(delay, 2000)
        })

        task = null
      }

      if (type === CLOSE && !(error || payload === 'debug')) break

      if (type === OPEN) {
        task = yield fork(open, payload)
      }
    }

  } catch (error) {
    warn(`unexpected error in *main: ${error.message}`)
    debug(error.stack)

  } finally {
    yield all([
      call(storage.persist, 'settings'),
      call(storage.persist, 'ui')
    ])

    yield all(aux.map(bg => {
      if (bg != null && bg.isRunning()) return cancel(bg)
    }))

    verbose('*main terminated')
  }
}

module.exports = {
  command,
  main,
  open
}
