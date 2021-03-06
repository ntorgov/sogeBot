import moment from 'moment';
require('moment-precise-range-plugin'); // moment.preciseDiff

export function getTime(time: null | number, isChat: boolean) {
  let days: string | number = 0;
  let hours: string | number = 0;
  let minutes: string | number = 0;
  let seconds: string | number = 0;
  const now = time === null || !time
    ? { days: 0, hours: 0, minutes: 0, seconds: 0 }
    : moment.preciseDiff(moment.utc(), moment.utc(time), true);
  if (isChat) {
    days = now.days > 0 ? now.days : '';
    hours = now.hours > 0 ? now.hours : '';
    minutes = now.minutes > 0 ? now.minutes : '';
    seconds = now.seconds > 0 ? now.seconds : '';

    if (days === '' && hours === '' && minutes === '' && seconds === '') {
      seconds = 1; // set seconds to 1 if everything else is missing
    }
    return { days,
      hours,
      minutes,
      seconds };
  } else {
    days = now.days > 0 ? now.days + 'd' : '';
    hours = now.hours >= 0 && now.hours < 10 ? '0' + now.hours + ':' : now.hours + ':';
    minutes = now.minutes >= 0 && now.minutes < 10 ? '0' + now.minutes + ':' : now.minutes + ':';
    seconds = now.seconds >= 0 && now.seconds < 10 ? '0' + now.seconds : now.seconds;
    return days + hours + minutes + seconds;
  }
}