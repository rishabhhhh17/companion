// Runs once a night. Removes orders that were never paid, once they are 30 days old.
export async function removeAbandonedOrders(db: any, now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Not written yet: nothing is removed.
  void db; void cutoff;
  return { removed: 0 };
}
