async function load() {
  throw new Error('the server said no');
}
load().then(() => console.log('ok'));
