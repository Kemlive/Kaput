let torClient = null;
let torFailed = false;

async function getTorClient() {
  if (torFailed) return null;
  if (torClient) return torClient;
  try {
    const { TorClient } = await import('tor-js');
    torClient = new TorClient({
      gateway: '121.127.33.23:12298:uEiA1FbSBeqU1zeKhITbEAvTGtRG3cMNWSJptp8o_NuCM1A',
      logLevel: 'warn',
    });
    await torClient.ready();
    console.log('[TOR] Client ready');
    return torClient;
  } catch (err) {
    console.warn('[TOR] Bootstrap failed, falling back to plain fetch:', err);
    torFailed = true;
    return null;
  }
}

export async function torFetch(url, options) {
  const client = await getTorClient();
  if (!client) return fetch(url, options);
  return client.fetch(url, options);
}
