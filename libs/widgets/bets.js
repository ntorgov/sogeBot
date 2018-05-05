'use strict'

const _ = require('lodash')
const debug = require('debug')

class BetsWidget {
  constructor () {
    this.timeouts = {}

    this.modifiedAt = 0
    this.currentBet = {}
    this.bets = []

    if (!global.commons.isSystemEnabled('bets') || require('cluster').isWorker) return

    global.panel.addWidget('bets', 'widget-title-bets', 'far fa-money-bill-alt')

    this.sockets()
    this.interval()
  }

  async interval () {
    try {
      let _modifiedAt = await global.db.engine.findOne('cache', { key: 'betsModifiedTime' })
      if (this.modifiedAt !== _modifiedAt) {
        this.modifiedAt = _modifiedAt
        this.currentBet = await global.db.engine.findOne('cache', { key: 'bets' })
        this.bets = await global.db.engine.find('bets.users')
      }
    } catch (e) {
      global.log.error(e.stack)
    } finally {
      if (!_.isNil(this.timeouts.interval)) clearTimeout(this.timeouts.interval)
      this.timeouts.interval = setTimeout(() => this.interval(), 1000)
    }
  }

  sockets () {
    const d = debug('BetsWidgets:sockets')

    global.panel.io.of('/widgets/bets').on('connection', (socket) => {
      d('Socket /widgets/bets connected, registering sockets')

      socket.on('data', async (callback) => {
        callback(this.currentBet, this.bets)
      })

      socket.on('config', async (callback) => {
        const data = { betPercentGain: await global.configuration.getValue('betPercentGain') }
        callback(data)
      })

      socket.on('close', async (option) => {
        const message = '!bet ' + (option === 'refund' ? option : 'close ' + option)
        global.log.process({ type: 'parse', sender: { username: global.commons.getOwner() }, message: message })
        _.sample(require('cluster').workers).send({ type: 'message', sender: { username: global.commons.getOwner() }, message: message, skip: true })
      })
    })
  }
}

module.exports = new BetsWidget()
