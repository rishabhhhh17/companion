function need(name) {
  if (!process.env[name]) throw new Error(name + ' is not set');
  return process.env[name];
}
module.exports = { url: need('SUPABASE_URL') };
