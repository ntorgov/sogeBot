// 3rdparty libraries
import * as _ from 'lodash';
import XRegExp from 'xregexp';
import emojiRegex from 'emoji-regex';
import tlds from 'tlds';

import * as constants from '../constants';
import { permission } from '../helpers/permissions';
import { command, default_permission, parser, permission_settings, settings } from '../decorators';
import Message from '../message';
import System from './_interface';
import { isModerator, parserReply, prepare, timeout } from '../commons';
import { getLocalizedName } from '../helpers/getLocalized';
import { timeout as timeoutLog, warning as warningLog } from '../helpers/log';
import { clusteredClientDelete } from '../cluster';
import { adminEndpoint } from '../helpers/socket';
import { Alias } from '../database/entity/alias';

import { getRepository, LessThan } from 'typeorm';
import { ModerationMessageCooldown, ModerationPermit, ModerationWarning } from '../database/entity/moderation';
import permissions from '../permissions';
import { translate } from '../translate';
import spotify from '../integrations/spotify';
import songs from './songs';
import aliasSystem from './alias';
import users from '../users';

const urlRegex = [
  new RegExp(`(www)? ??\\.? ?[a-zA-Z0-9]+([a-zA-Z0-9-]+) ??\\. ?(${tlds.join('|')})(?=\\P{L}|$)`, 'igu'),
  new RegExp(`[a-zA-Z0-9]+([a-zA-Z0-9-]+)?\\.(${tlds.join('|')})(?=\\P{L}|$)`, 'igu'),
];

class Moderation extends System {
  @settings('lists')
  cListsWhitelist: string[] = [];
  @settings('lists')
  cListsBlacklist: string[] = [];
  @permission_settings('lists', [ permission.CASTERS ])
  cListsEnabled = true;
  @permission_settings('lists', [ permission.CASTERS ])
  cListsTimeout = 120;

  @permission_settings('links', [ permission.CASTERS ])
  cLinksEnabled = true;
  @permission_settings('links', [ permission.CASTERS ])
  cLinksIncludeSpaces = false;
  @permission_settings('links', [ permission.CASTERS ])
  cLinksIncludeClips = true;
  @permission_settings('links', [ permission.CASTERS ])
  cLinksTimeout = 120;

  @permission_settings('symbols', [ permission.CASTERS ])
  cSymbolsEnabled = true;
  @permission_settings('symbols', [ permission.CASTERS ])
  cSymbolsTriggerLength = 15;
  @permission_settings('symbols', [ permission.CASTERS ])
  cSymbolsMaxSymbolsConsecutively = 10;
  @permission_settings('symbols', [ permission.CASTERS ])
  cSymbolsMaxSymbolsPercent = 50;
  @permission_settings('symbols', [ permission.CASTERS ])
  cSymbolsTimeout = 120;

  @permission_settings('longMessage', [ permission.CASTERS ])
  cLongMessageEnabled = true;
  @permission_settings('longMessage', [ permission.CASTERS ])
  cLongMessageTriggerLength = 300;
  @permission_settings('longMessage', [ permission.CASTERS ])
  cLongMessageTimeout = 120;

  @permission_settings('caps', [ permission.CASTERS ])
  cCapsEnabled = true;
  @permission_settings('caps', [ permission.CASTERS ])
  cCapsTriggerLength = 15;
  @permission_settings('caps', [ permission.CASTERS ])
  cCapsMaxCapsPercent = 50;
  @permission_settings('caps', [ permission.CASTERS ])
  cCapsTimeout = 120;

  @permission_settings('spam', [ permission.CASTERS ])
  cSpamEnabled = true;
  @permission_settings('spam', [ permission.CASTERS ])
  cSpamTriggerLength = 15;
  @permission_settings('spam', [ permission.CASTERS ])
  cSpamMaxLength = 50;
  @permission_settings('spam', [ permission.CASTERS ])
  cSpamTimeout = 300;

  @permission_settings('color', [ permission.CASTERS ])
  cColorEnabled = true;
  @permission_settings('color', [ permission.CASTERS ])
  cColorTimeout = 300;

  @permission_settings('emotes', [ permission.CASTERS ])
  cEmotesEnabled = true;
  @permission_settings('emotes', [ permission.CASTERS ])
  cEmotesEmojisAreEmotes = true;
  @permission_settings('emotes', [ permission.CASTERS ])
  cEmotesMaxCount = 15;
  @permission_settings('emotes', [ permission.CASTERS ])
  cEmotesTimeout = 120;

  @settings('warnings')
  cWarningsAllowedCount = 3;
  @settings('warnings')
  cWarningsAnnounceTimeouts = true;
  @settings('warnings')
  cWarningsShouldClearChat = true;

  sockets () {
    adminEndpoint(this.nsp, 'lists.get', async (cb) => {
      cb(null, {
        blacklist: this.cListsBlacklist,
        whitelist: this.cListsWhitelist,
      });
    });
    adminEndpoint(this.nsp, 'lists.set', (data) => {
      this.cListsBlacklist = data.blacklist.filter(entry => entry.trim() !== '');
      this.cListsWhitelist = data.whitelist.filter(entry => entry.trim() !== '');
    });
  }

  async timeoutUser (sender: CommandOptions['sender'], text: string, warning: string, msg: string, time: number, type: string) {
    // cleanup warnings
    await getRepository(ModerationWarning).delete({
      timestamp: LessThan(Date.now() - 1000 * 60 * 60),
    });
    const warnings = await getRepository(ModerationWarning).find({ userId: Number(sender.userId) });
    const silent = await this.isSilent(type);

    text = text.trim();

    if (this.cWarningsAllowedCount === 0) {
      msg = await new Message(msg.replace(/\$count/g, String(-1))).parse();
      timeoutLog(`${sender.username} [${type}] ${time}s timeout | ${text}`);
      timeout(sender.username, msg, time, isModerator(sender));
      return;
    }

    const isWarningCountAboveThreshold = warnings.length >= this.cWarningsAllowedCount;
    if (isWarningCountAboveThreshold) {
      msg = await new Message(warning.replace(/\$count/g, String(this.cWarningsAllowedCount - warnings.length))).parse();
      timeoutLog(`${sender.username} [${type}] ${time}s timeout | ${text}`);
      timeout(sender.username, msg, time, isModerator(sender));
      await getRepository(ModerationWarning).delete({ userId: Number(sender.userId) });
    } else {
      await getRepository(ModerationWarning).insert({ userId: Number(sender.userId), timestamp: Date.now() });
      const warningsLeft = this.cWarningsAllowedCount - warnings.length;
      warning = await new Message(warning.replace(/\$count/g, String(warningsLeft < 0 ? 0 : warningsLeft))).parse();
      if (this.cWarningsShouldClearChat) {
        timeoutLog(`${sender.username} [${type}] 1s timeout, warnings left ${warningsLeft < 0 ? 0 : warningsLeft} | ${text}`);
        timeout(sender.username, warning, 1, isModerator(sender));
      }

      if (this.cWarningsAnnounceTimeouts) {
        clusteredClientDelete(sender.id);
        if (!silent) {
          parserReply('$sender, ' + warning, { sender });
        } else {
          warningLog(`Moderation announce was not sent (another ${type} warning already sent in 60s): ${sender.username}, ${warning}`);
        }
      }
    }
  }

  async whitelist (text: string, permId: string | null) {
    let ytRegex, clipsRegex, spotifyRegex;

    // check if spotify -or- alias of spotify contain open.spotify.com link
    if (spotify.enabled) {
      // we can assume its first command in array (spotify have only one command)
      const cmd = (await spotify.commands())[0].command;
      const alias = await getRepository(Alias).findOne({ where: { command: cmd } });
      if (alias && alias.enabled && aliasSystem.enabled) {
        spotifyRegex = new RegExp('^(' + cmd + '|' + alias.alias + ') \\S+open\\.spotify\\.com\\/track\\/(\\w+)(.*)?', 'gi');
      } else {
        spotifyRegex = new RegExp('^(' + cmd + ') \\S+open\\.spotify\\.com\\/track\\/(\\w+)(.*)?', 'gi');
      }
      text = text.replace(spotifyRegex, '');
    }

    // check if songrequest -or- alias of songrequest contain youtube link
    if (songs.enabled) {
      const alias = await getRepository(Alias).findOne({ where: { command: '!songrequest' } });
      const cmd = songs.getCommand('!songrequest');
      if (alias && alias.enabled && aliasSystem.enabled) {
        ytRegex = new RegExp('^(' + cmd + '|' + alias.alias + ') \\S+(?:youtu.be\\/|v\\/|e\\/|u\\/\\w+\\/|embed\\/|v=)([^#&?]*).*', 'gi');
      } else {
        ytRegex =  new RegExp('^(' + cmd + ') \\S+(?:youtu.be\\/|v\\/|e\\/|u\\/\\w+\\/|embed\\/|v=)([^#&?]*).*', 'gi');
      }
      text = text.replace(ytRegex, '');
    }

    if (permId) {
      const cLinksIncludeClips = (await this.getPermissionBasedSettingsValue('cLinksIncludeClips'))[permId];
      if (!cLinksIncludeClips) {
        clipsRegex = /.*(clips.twitch.tv\/)(\w+)/g;
        text = text.replace(clipsRegex, '');
        clipsRegex = /.*(www.twitch.tv\/\w+\/clip\/)(\w+)/g;
        text = text.replace(clipsRegex, '');
      }
    }

    text = ` ${text} `;
    const whitelist = this.cListsWhitelist;

    for (const value of whitelist.map(o => o.trim().replace(/\*/g, '[\\pL0-9\\S]*').replace(/\+/g, '[\\pL0-9\\S]+'))) {
      if (value.length > 0) {
        let regexp;
        if (value.startsWith('domain:')) {
          regexp = XRegExp(` [\\S]*${XRegExp.escape(value.replace('domain:', ''))}[\\S]* `, 'gi');
        } else { // default regexp behavior
          regexp = XRegExp(` [^\\s\\pL0-9\\w]?${value}[^\\s\\pL0-9\\w]? `, 'gi');
        }
        // we need to change 'text' to ' text ' for regexp to correctly work
        text = XRegExp.replace(` ${text} `, regexp, '').trim();
      }
    }
    return text.trim();
  }

  @command('!permit')
  @default_permission(permission.CASTERS)
  async permitLink (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const parsed = opts.parameters.match(/^@?([\S]+) ?(\d+)?$/);
      if (!parsed) {
        throw new Error('!permit command not parsed');
      }
      let count = 1;
      if (!_.isNil(parsed[2])) {
        count = parseInt(parsed[2], 10);
      }

      const userId = await users.getIdByName(parsed[1].toLowerCase());
      for (let i = 0; i < count; i++) {
        await getRepository(ModerationPermit).insert({ userId });
      }

      const response = prepare('moderation.user-have-link-permit', { username: parsed[1].toLowerCase(), link: getLocalizedName(count, translate('core.links')), count: count });
      return [{ response, ...opts }];
    } catch (e) {
      return [{ response: translate('moderation.permit-parse-failed'), ...opts }];
    }
  }

  @parser({ priority: constants.MODERATION })
  async containsLink (opts: ParserOptions) {
    const enabled = await this.getPermissionBasedSettingsValue('cLinksEnabled');
    const cLinksIncludeSpaces = await this.getPermissionBasedSettingsValue('cLinksIncludeSpaces');
    const timeoutValues = await this.getPermissionBasedSettingsValue('cLinksTimeout');
    const permId = await permissions.getUserHighestPermission(opts.sender.userId);

    if (permId === null || !enabled[permId] || permId === permission.CASTERS) {
      return true;
    }

    const whitelisted = await this.whitelist(opts.message, permId);
    if (whitelisted.search(urlRegex[cLinksIncludeSpaces[permId] ? 0 : 1]) >= 0) {
      const permit = await getRepository(ModerationPermit).findOne({ userId: Number(opts.sender.userId) });
      if (permit) {
        await getRepository(ModerationPermit).remove(permit);
        return true;
      } else {
        this.timeoutUser(opts.sender, whitelisted,
          translate('moderation.user-is-warned-about-links'),
          translate('moderation.user-have-timeout-for-links'),
          timeoutValues[permId], 'links');
        return false;
      }
    } else {
      return true;
    }
  }

  @parser({ priority: constants.MODERATION })
  async symbols (opts: ParserOptions) {
    const enabled = await this.getPermissionBasedSettingsValue('cSymbolsEnabled');
    const cSymbolsTriggerLength = await this.getPermissionBasedSettingsValue('cSymbolsTriggerLength');
    const cSymbolsMaxSymbolsConsecutively = await this.getPermissionBasedSettingsValue('cSymbolsMaxSymbolsConsecutively');
    const cSymbolsMaxSymbolsPercent = await this.getPermissionBasedSettingsValue('cSymbolsMaxSymbolsPercent');
    const timeoutValues = await this.getPermissionBasedSettingsValue('cSymbolsTimeout');
    const permId = await permissions.getUserHighestPermission(opts.sender.userId);

    if (permId === null || !enabled[permId] || permId === permission.CASTERS) {
      return true;
    }

    const whitelisted = await this.whitelist(opts.message, permId);
    const msgLength = whitelisted.trim().length;
    let symbolsLength = 0;

    if (msgLength < cSymbolsTriggerLength[permId]) {
      return true;
    }

    const out = whitelisted.match(/([^\s\u0500-\u052F\u0400-\u04FF\w]+)/g);
    for (const item in out) {
      if (out.hasOwnProperty(item)) {
        const symbols = out[Number(item)];
        if (symbols.length >= cSymbolsMaxSymbolsConsecutively[permId]) {
          this.timeoutUser(opts.sender, opts.message,
            translate('moderation.user-is-warned-about-symbols'),
            translate('moderation.user-have-timeout-for-symbols'),
            timeoutValues[permId], 'symbols');
          return false;
        }
        symbolsLength = symbolsLength + symbols.length;
      }
    }
    if (Math.ceil(symbolsLength / (msgLength / 100)) >= cSymbolsMaxSymbolsPercent[permId]) {
      this.timeoutUser(opts.sender, opts.message, translate('moderation.user-is-warned-about-symbols'), translate('moderation.symbols'), timeoutValues[permId], 'symbols');
      return false;
    }
    return true;
  }

  @parser({ priority: constants.MODERATION })
  async longMessage (opts: ParserOptions) {
    const enabled = await this.getPermissionBasedSettingsValue('cLongMessageEnabled');
    const cLongMessageTriggerLength = await this.getPermissionBasedSettingsValue('cLongMessageTriggerLength');
    const timeoutValues = await this.getPermissionBasedSettingsValue('cLongMessageTimeout');
    const permId = await permissions.getUserHighestPermission(opts.sender.userId);

    if (permId === null || !enabled[permId] || permId === permission.CASTERS) {
      return true;
    }

    const whitelisted = await this.whitelist(opts.message, permId);

    const msgLength = whitelisted.trim().length;
    if (msgLength < cLongMessageTriggerLength[permId]) {
      return true;
    } else {
      this.timeoutUser(opts.sender, opts.message,
        translate('moderation.user-is-warned-about-long-message'),
        translate('moderation.user-have-timeout-for-long-message'),
        timeoutValues[permId], 'longmessage');
      return false;
    }
  }

  @parser({ priority: constants.MODERATION })
  async caps (opts: ParserOptions) {
    const enabled = await this.getPermissionBasedSettingsValue('cCapsEnabled');
    const cCapsTriggerLength = await this.getPermissionBasedSettingsValue('cCapsTriggerLength');
    const cCapsMaxCapsPercent = await this.getPermissionBasedSettingsValue('cCapsMaxCapsPercent');
    const timeoutValues = await this.getPermissionBasedSettingsValue('cCapsTimeout');
    const permId = await permissions.getUserHighestPermission(opts.sender.userId);

    if (permId === null || !enabled[permId] || permId === permission.CASTERS) {
      return true;
    }
    let whitelisted = await this.whitelist(opts.message, permId);

    const emotesCharList: number[] = [];
    if (Symbol.iterator in Object(opts.sender.emotes)) {
      for (const emote of opts.sender.emotes) {
        for (const i of _.range(emote.start, emote.end + 1)) {
          emotesCharList.push(i);
        }
      }
    }

    let msgLength = whitelisted.trim().length;
    let capsLength = 0;

    // exclude emotes from caps check
    whitelisted = whitelisted.replace(emojiRegex(), '').trim();

    const regexp = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]/gi;
    for (let i = 0; i < whitelisted.length; i++) {
      // if is emote or symbol - continue
      if (_.includes(emotesCharList, i) || !_.isNull(whitelisted.charAt(i).match(regexp))) {
        msgLength--;
        continue;
      } else if (!_.isFinite(parseInt(whitelisted.charAt(i), 10)) && whitelisted.charAt(i).toUpperCase() === whitelisted.charAt(i) && whitelisted.charAt(i) !== ' ') {
        capsLength += 1;
      }
    }

    if (msgLength < cCapsTriggerLength[permId]) {
      return true;
    }
    if (Math.ceil(capsLength / (msgLength / 100)) >= cCapsMaxCapsPercent[permId]) {
      this.timeoutUser(opts.sender, opts.message,
        translate('moderation.user-is-warned-about-caps'),
        translate('moderation.user-have-timeout-for-caps'),
        timeoutValues[permId], 'caps');
      return false;
    }
    return true;
  }

  @parser({ priority: constants.MODERATION })
  async spam (opts: ParserOptions) {
    const enabled = await this.getPermissionBasedSettingsValue('cSpamEnabled');
    const cSpamTriggerLength = await this.getPermissionBasedSettingsValue('cSpamTriggerLength');
    const cSpamMaxLength = await this.getPermissionBasedSettingsValue('cSpamMaxLength');
    const timeoutValues = await this.getPermissionBasedSettingsValue('cSpamTimeout');
    const permId = await permissions.getUserHighestPermission(opts.sender.userId);

    if (permId === null || !enabled[permId] || permId === permission.CASTERS) {
      return true;
    }
    const whitelisted = await this.whitelist(opts.message,permId);

    const msgLength = whitelisted.trim().length;

    if (msgLength < cSpamTriggerLength[permId]) {
      return true;
    }
    const out = whitelisted.match(/(.+)(\1+)/g);
    for (const item in out) {
      if (out.hasOwnProperty(item) && out[Number(item)].length >= cSpamMaxLength[permId]) {
        this.timeoutUser(opts.sender, opts.message,
          translate('moderation.user-have-timeout-for-spam'),
          translate('moderation.user-is-warned-about-spam'),
          timeoutValues[permId], 'spam');
        return false;
      }
    }
    return true;
  }

  @parser({ priority: constants.MODERATION })
  async color (opts: ParserOptions) {
    const enabled = await this.getPermissionBasedSettingsValue('cColorEnabled');
    const timeoutValues = await this.getPermissionBasedSettingsValue('cColorTimeout');
    const permId = await permissions.getUserHighestPermission(opts.sender.userId);

    if (permId === null || !enabled[permId] || permId === permission.CASTERS) {
      return true;
    }

    if (opts.sender['message-type'] === 'action') {
      this.timeoutUser(opts.sender, opts.message,
        translate('moderation.user-is-warned-about-color'),
        translate('moderation.user-have-timeout-for-color'),
        timeoutValues[permId], 'color');
      return false;
    } else {
      return true;
    }
  }

  @parser({ priority: constants.MODERATION })
  async emotes (opts: ParserOptions) {
    if (!(Symbol.iterator in Object(opts.sender.emotes))) {
      return true;
    }

    const enabled = await this.getPermissionBasedSettingsValue('cEmotesEnabled');
    const cEmotesEmojisAreEmotes = await this.getPermissionBasedSettingsValue('cEmotesEmojisAreEmotes');
    const cEmotesMaxCount = await this.getPermissionBasedSettingsValue('cEmotesMaxCount');
    const timeoutValues = await this.getPermissionBasedSettingsValue('cEmotesTimeout');
    const permId = await permissions.getUserHighestPermission(opts.sender.userId);

    if (permId === null || !enabled[permId] || permId === permission.CASTERS) {
      return true;
    }

    let count = opts.sender.emotes.length;
    if (cEmotesEmojisAreEmotes[permId]) {
      const regex = emojiRegex();
      while (regex.exec(opts.message)) {
        count++;
      }
    }

    if (count > cEmotesMaxCount[permId]) {
      this.timeoutUser(opts.sender, opts.message,
        translate('moderation.user-is-warned-about-emotes'),
        translate('moderation.user-have-timeout-for-emotes'),
        timeoutValues[permId], 'emotes');
      return false;
    } else {
      return true;
    }
  }

  @parser({ priority: constants.MODERATION })
  async blacklist (opts: ParserOptions) {
    const enabled = await this.getPermissionBasedSettingsValue('cListsEnabled');
    const timeoutValues = await this.getPermissionBasedSettingsValue('cListsTimeout');
    const permId = await permissions.getUserHighestPermission(opts.sender.userId);

    if (permId === null || !enabled[permId] || permId === permission.CASTERS) {
      return true;
    }

    let isOK = true;
    for (const value of this.cListsBlacklist.map(o => o.trim().replace(/\*/g, '[\\pL0-9]*').replace(/\+/g, '[\\pL0-9]+'))) {
      if (value.length > 0) {
        const regexp = XRegExp(` [^\\s\\pL0-9\\w]?${value}[^\\s\\pL0-9\\w]? `, 'gi');
        // we need to change 'text' to ' text ' for regexp to correctly work
        if (XRegExp.exec(` ${opts.message} `, regexp)) {
          isOK = false;
          this.timeoutUser(opts.sender, opts.message,
            translate('moderation.user-is-warned-about-blacklist'),
            translate('moderation.user-have-timeout-for-blacklist'),
            timeoutValues[permId], 'blacklist');
          break;
        }
      }
    }
    return isOK;
  }

  async isSilent (name: string) {
    const item = await getRepository(ModerationMessageCooldown).findOne({ name });
    if (!item || (Date.now() - item.timestamp) >= 60000) {
      await getRepository(ModerationMessageCooldown).save({
        ...item, name, timestamp: Date.now(),
      });
      return false;
    }
    return true;
  }
}

export default new Moderation();
