const _ = require('lodash')
const cluster = require('cluster')
const crypto = require('crypto')
const debug = require('debug')
const util = require('util')

const Interface = require('./interface')

class IMasterController extends Interface {
  constructor () {
    super('master')

    cluster.on('message', (worker, message) => {
      debug('db:master:incoming')(`Got data from Worker#${worker.id}\n${util.inspect(message)}`)
      this.data[message.id] = {
        items: message.items,
        timestamp: _.now(),
        finished: false
      }
    })

    this.connected = false
    this.data = {}

    this.connect()
    this.cleanup()
  }

  cleanup () {
    try {
      const size = _.size(this.data)
      for (let [id, values] of Object.entries(this.data)) {
        if (_.now() - values.timestamp > 10000 || values.finished) delete this.data[id]
      }
      debug('db:master:cleanup')('Cleaned up ' + (size - _.size(this.data)))
    } catch (e) {
      global.log.error(e.stack)
    } finally {
      setTimeout(() => this.cleanup(), 1)
    }
  }

  async connect () {
    let allOnline = true
    for (let worker in cluster.workers) {
      if (cluster.workers[worker].state !== 'online') allOnline = false
    }
    if (allOnline) setTimeout(() => { this.connected = true; debug('db:master')('Connected') }, 5000) // TODO: send workers db find and if returned then its ok
    else setTimeout(() => this.connect(), 10)
  }

  async find (table, where) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'find', table: table, where: where, id: id }
    _.sample(cluster.workers).send(data)

    return new Promise((resolve, reject) => {
      const start = _.now()
      let retries = 1
      let returnData = (resolve, reject, id) => {
        if ((_.now() - start > 4000 * retries && retries < 5)) {
          _.sample(cluster.workers).send(data) // retry
          debug('db:master:retry')('Retrying #' + retries + ' ' + util.inspect(data))
          retries++
        } else if (_.now() - start > 30000) {
          debug('db:master:retry')('DB operation failed - ' + util.inspect(data))
          resolve([])
        }

        if (!_.isNil(this.data[id])) {
          if (retries > 1) debug('db:master:retry')('Retry successful' + util.inspect(data))
          const items = this.data[id].items
          this.data[id].finished = true
          resolve(items)
        } else setTimeout(() => returnData(resolve, reject, id), 1)
      }
      returnData(resolve, reject, id)
    })
  }

  async findOne (table, where) {
    const id = crypto.randomBytes(64).toString('hex')
    const worker = _.sample(cluster.workers)
    const data = { type: 'db', fnc: 'findOne', table: table, where: where, id: id }
    worker.send(data)

    return new Promise((resolve, reject) => {
      const start = _.now()
      let retries = 1
      let returnData = (resolve, reject, id) => {
        if ((_.now() - start > 4000 * retries && retries < 5)) {
          _.sample(cluster.workers).send(data) // retry
          debug('db:master:retry')('Retrying #' + retries + ' ' + util.inspect(data))
          retries++
        } else if (_.now() - start > 30000) {
          debug('db:master:retry')('DB operation failed - ' + util.inspect(data))
          resolve([])
        }

        if (!_.isNil(this.data[id])) {
          if (retries > 1) debug('db:master:retry')('Retry successful' + util.inspect(data))
          const items = this.data[id].items
          this.data[id].finished = true
          resolve(items)
        } else setTimeout(() => returnData(resolve, reject, id), 1)
      }
      returnData(resolve, reject, id)
    })
  }

  async insert (table, object) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'insert', table: table, object: object, id: id }
    _.sample(cluster.workers).send(data)

    return new Promise((resolve, reject) => {
      const start = _.now()
      let retries = 1
      let returnData = (resolve, reject, id) => {
        if ((_.now() - start > 4000 * retries && retries < 5)) {
          _.sample(cluster.workers).send(data) // retry
          debug('db:master:retry')('Retrying #' + retries + ' ' + util.inspect(data))
          retries++
        } else if (_.now() - start > 30000) {
          debug('db:master:retry')('DB operation failed - ' + util.inspect(data))
          resolve([])
        }

        if (!_.isNil(this.data[id])) {
          if (retries > 1) debug('db:master:retry')('Retry successful' + util.inspect(data))
          const items = this.data[id].items
          this.data[id].finished = true
          resolve(items)
        } else setTimeout(() => returnData(resolve, reject, id), 1)
      }
      returnData(resolve, reject, id)
    })
  }

  async remove (table, where) {
    const id = crypto.randomBytes(64).toString('hex')
    const worker = _.sample(cluster.workers)
    const data = { type: 'db', fnc: 'remove', table: table, where: where, id: id }
    worker.send(data)

    return new Promise((resolve, reject) => {
      const start = _.now()
      let retries = 1
      let returnData = (resolve, reject, id) => {
        if ((_.now() - start > 4000 * retries && retries < 5)) {
          _.sample(cluster.workers).send(data) // retry
          debug('db:master:retry')('Retrying #' + retries + ' ' + util.inspect(data))
          retries++
        } else if (_.now() - start > 30000) {
          debug('db:master:retry')('DB operation failed - ' + util.inspect(data))
          resolve([])
        }

        if (!_.isNil(this.data[id])) {
          if (retries > 1) debug('db:master:retry')('Retry successful' + util.inspect(data))
          const items = this.data[id].items
          this.data[id].finished = true
          resolve(items)
        } else setTimeout(() => returnData(resolve, reject, id), 1)
      }
      returnData(resolve, reject, id)
    })
  }

  async update (table, where, object) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'update', table: table, where: where, object: object, id: id }
    _.sample(cluster.workers).send(data)

    return new Promise((resolve, reject) => {
      const start = _.now()
      let retries = 1
      let returnData = (resolve, reject, id) => {
        if ((_.now() - start > 4000 * retries && retries < 5)) {
          _.sample(cluster.workers).send(data) // retry
          debug('db:master:retry')('Retrying #' + retries + ' ' + util.inspect(data))
          retries++
        } else if (_.now() - start > 30000) {
          debug('db:master:retry')('DB operation failed - ' + util.inspect(data))
          resolve([])
        }

        if (!_.isNil(this.data[id])) {
          if (retries > 1) debug('db:master:retry')('Retry successful' + util.inspect(data))
          const items = this.data[id].items
          this.data[id].finished = true
          resolve(items)
        } else setTimeout(() => returnData(resolve, reject, id), 1)
      }
      returnData(resolve, reject, id)
    })
  }

  async incrementOne (table, where, object) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'incrementOne', table: table, where: where, object: object, id: id }
    _.sample(cluster.workers).send(data)

    return new Promise((resolve, reject) => {
      const start = _.now()
      let retries = 1
      let returnData = (resolve, reject, id) => {
        if ((_.now() - start > 4000 * retries && retries < 5)) {
          _.sample(cluster.workers).send(data) // retry
          debug('db:master:retry')('Retrying #' + retries + ' ' + util.inspect(data))
          retries++
        } else if (_.now() - start > 30000) {
          debug('db:master:retry')('DB operation failed - ' + util.inspect(data))
          resolve([])
        }

        if (!_.isNil(this.data[id])) {
          if (retries > 1) debug('db:master:retry')('Retry successful' + util.inspect(data))
          const items = this.data[id].items
          this.data[id].finished = true
          resolve(items)
        } else setTimeout(() => returnData(resolve, reject, id), 1)
      }
      returnData(resolve, reject, id)
    })
  }

  async increment (table, where, object) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'increment', table: table, where: where, object: object, id: id }
    _.sample(cluster.workers).send(data)

    return new Promise((resolve, reject) => {
      const start = _.now()
      let retries = 1
      let returnData = (resolve, reject, id) => {
        if ((_.now() - start > 4000 * retries && retries < 5)) {
          _.sample(cluster.workers).send(data) // retry
          debug('db:master:retry')('Retrying #' + retries + ' ' + util.inspect(data))
          retries++
        } else if (_.now() - start > 30000) {
          debug('db:master:retry')('DB operation failed - ' + util.inspect(data))
          resolve([])
        }

        if (!_.isNil(this.data[id])) {
          if (retries > 1) debug('db:master:retry')('Retry successful' + util.inspect(data))
          const items = this.data[id].items
          this.data[id].finished = true
          resolve(items)
        } else setTimeout(() => returnData(resolve, reject, id), 1)
      }
      returnData(resolve, reject, id)
    })
  }
}

module.exports = IMasterController
