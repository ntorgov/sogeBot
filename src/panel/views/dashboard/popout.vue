<template>
  <component :is="$route.params.widget" nodrag :popout="true"></component>
</template>

<script>
import { defineComponent } from '@vue/composition-api'

export default defineComponent({
  components: {
    bets: () => import('src/panel/widgets/components/bets.vue'),
    chat: () => import('src/panel/widgets/components/chat.vue'),
    cmdboard: () => import('src/panel/widgets/components/cmdboard.vue'),
    commercial: () => import('src/panel/widgets/components/commercial.vue'),
    customvariables: () => import('src/panel/widgets/components/customvariables.vue'),
    eventlist: () => import('src/panel/widgets/components/eventlist.vue'),
    join: () => import('src/panel/widgets/components/join.vue'),
    part: () => import('src/panel/widgets/components/part.vue'),
    queue: () => import('src/panel/widgets/components/queue.vue'),
    raffles: () => import('src/panel/widgets/components/raffles.vue'),
    randomizer: () => import('src/panel/widgets/components/randomizer.vue'),
    soundboard: () => import('src/panel/widgets/components/soundboard.vue'),
    spotify: () => import('src/panel/widgets/components/spotify.vue'),
    twitch: () => import('src/panel/widgets/components/twitch.vue'),
    widgetCreate: () => import('src/panel/widgets/components/widget_create.vue'),
    ytplayer: () => import('src/panel/widgets/components/ytplayer.vue'),
    social: () => import('src/panel/widgets/components/social.vue'),
  }
});
</script>