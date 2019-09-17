import axios from 'axios';
import io from 'socket.io-client';
import { get } from 'lodash';
import { permission } from 'src/bot/helpers/permissions';

export const isUserLoggedIn = async function (token: string) {
  // check if we have auth code
  const code = localStorage.getItem('code') || '';
  if (code.trim().length === 0) {
    console.log('Redirecting, user is not authenticated');
    if (window.location.href.includes('popout')) {
      window.location.replace(window.location.origin + '/login#error=popout+must+be+logged#url=' + window.location.href);
    } else {
      window.location.replace(window.location.origin + '/login');
    }
  } else {
    const axiosData = await axios.get(`https://api.twitch.tv/helix/users`, {
      headers: {
        'Authorization': 'Bearer ' + code,
      },
    });
    const data = get(axiosData, 'data.data[0]', null);
    if (data === null) {
      console.log('Redirecting, user code expired');
      if (window.location.href.includes('popout')) {
        window.location.replace(window.location.origin + '/login#error=popout+must+be+logged');
      } else {
        window.location.replace(window.location.origin + '/login');
      }
    }

    // save userId to db
    await new Promise((resolve) => {
      const socket = io('/core/users', { query: 'token=' + token });
      socket.emit('update', {
        collection: '_users',
        key: 'id',
        items: [
          {
            id: data.id,
            username: data.login,
          },
        ],
      }, (err, data) => {
        resolve();
      });
    });
    return data;
  }
};

export const isUserCaster = async function (userId: string, token: string) {
  return new Promise((resolve) => {
    const socket = io('/core/users', { query: 'token=' + token });
    socket.emit('findOne.viewer', { where: { id: userId }}, (err, viewer) => {
      if (viewer.permission.id !== permission.CASTERS) {
        window.location.replace(window.location.origin + '/login#error=must+be+caster');
      }
      resolve();
    });
  });
};