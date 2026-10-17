// On the server this reads the database; here it returns the week's plants.
export async function getPlants() {
  return [
    { id: 1, name: 'Fern' },
    { id: 2, name: 'Moss' },
  ];
}
