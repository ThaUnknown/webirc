<script lang='ts'>
  import MessageClient from './irc'

  export let client: MessageClient

  const messages = client.messages
  const users = client.users

  function send (e: KeyboardEvent) {
    if (e.key === 'Enter') {
      client.say(e.target.value)
      e.target.value = ''
    }
  }
</script>

<div style='display: flex; flex-direction: row; flex-grow: 1;'>
  <div style='width: 100%;'>
    {#each $messages as { ident, message }}
      <div>
        {ident}: {message}
      </div>
    {/each}
  </div>
  <div>
    {#each Object.keys($users) as ident}
      <div>{ident}</div>
    {/each}
  </div>
</div>
<input type='text' on:keydown={send} />
