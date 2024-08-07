<script lang='ts'>
  import MessageClient from './irc'

  export let client: MessageClient

  const messages = client.messages
  const users = client.users
</script>

<div style='display: flex; flex-direction: row;'>
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
