<script lang='ts'>
  import Chat from './lib/Chat.svelte'
  import Client from './lib/irc.ts'

  let username = ''
  let client: Promise<Client> | null = null

  function connect () {
    if (!username) return
    client = Client.new(username)
  }

</script>
{#if !client}
  <input type='text' bind:value={username} placeholder='Choose Nickname' />
  <button on:click={connect}>Join</button>
{:else}
  {#await client}
    Connecting....
  {:then client}
    <Chat {client} />
  {/await}
{/if}
