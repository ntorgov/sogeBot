import * as _ from 'lodash';
import crypto from 'crypto';

import Overlay from './_interface';
import { isBot } from '../commons';
import { ui } from '../decorators';
import { adminEndpoint, publicEndpoint } from '../helpers/socket';

import { Brackets, getRepository } from 'typeorm';
import { EventList as EventListEntity } from '../database/entity/eventList';
import eventlist from '../widgets/eventlist';
import users from '../users';

class EventList extends Overlay {
  @ui({
    type: 'link',
    href: '/overlays/eventlist',
    class: 'btn btn-primary btn-block',
    rawText: '/overlays/eventlist (350x220)',
    target: '_blank',
  }, 'links')
  linkBtn = null;

  sockets () {
    adminEndpoint(this.nsp, 'eventlist::getUserEvents', async (userId, cb) => {
      const eventsByUserId = await getRepository(EventListEntity).find({userId});
      // we also need subgifts by giver
      const eventsByRecipientId
        = (await getRepository(EventListEntity).find({event:'subgift'}))
          .filter(o => JSON.parse(o.values_json).from === String(userId));
      const events =  _.orderBy([ ...eventsByRecipientId, ...eventsByUserId ], 'timestamp', 'desc');
      // we need to change userId => username and from => from username for eventlist compatibility
      const mapping = new Map() as Map<string, string>;
      for (const event of events) {
        const values = JSON.parse(event.values_json);
        if (values.from && values.from != '0') {
          if (!mapping.has(values.from)) {
            mapping.set(values.from, await users.getNameById(values.from));
          }
        }
        if (!mapping.has(event.userId)) {
          mapping.set(event.userId, await users.getNameById(event.userId));
        }
      }
      cb(null, events.map(event => {
        const values = JSON.parse(event.values_json);
        if (values.from && values.from != '0') {
          values.from = mapping.get(values.from);
        }
        return {
          ...event,
          username: mapping.get(event.userId),
          values_json: JSON.stringify(values),
        };
      }));
    });
    publicEndpoint(this.nsp, 'getEvents', async (opts: { ignore: string; limit: number }, cb) => {
      let events = await getRepository(EventListEntity)
        .createQueryBuilder('events')
        .select('events')
        .orderBy('events.timestamp', 'DESC')
        .where(new Brackets(qb => {
          const ignored = opts.ignore.split(',').map(value => value.trim());
          for (let i = 0; i < ignored.length; i++) {
            qb.andWhere(`events.event != :event_${i}`, { ['event_' + i]: ignored[i] });
          }
        }))
        .limit(opts.limit)
        .getMany();
      if (events) {
        events = _.uniqBy(events, o =>
          (o.userId + (o.event === 'cheer' ? crypto.randomBytes(64).toString('hex') : o.event))
        );
      }

      // we need to change userId => username and from => from username for eventlist compatibility
      const mapping = new Map() as Map<string, string>;
      for (const event of events) {
        const values = JSON.parse(event.values_json);
        if (values.from && values.from != '0') {
          if (!mapping.has(values.from)) {
            mapping.set(values.from, await users.getNameById(values.from));
          }
        }
        if (!mapping.has(event.userId)) {
          mapping.set(event.userId, await users.getNameById(event.userId));
        }
      }

      cb(null, events.map(event => {
        const values = JSON.parse(event.values_json);
        if (values.from && values.from != '0') {
          values.from = mapping.get(values.from);
        }
        return {
          ...event,
          username: mapping.get(event.userId),
          values_json: JSON.stringify(values),
        };
      }));
    });
  }

  async add (data: EventList.Event) {
    if (isBot(await users.getNameById(data.userId))) {
      return;
    } // don't save event from a bot

    await getRepository(EventListEntity).save({
      event: data.event,
      userId: data.userId,
      timestamp: Date.now(),
      isTest: data.isTest ?? false,
      values_json: JSON.stringify(
        Object.keys(data)
          .filter(key => !['event', 'username', 'timestamp', 'isTest'].includes(key))
          .reduce((obj, key) => {
            return {
              ...obj,
              [key]: (data as any)[key],
            };
          }, {}),
      ),
    });
    eventlist.askForGet();
  }
}

export default new EventList();