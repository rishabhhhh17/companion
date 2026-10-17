import { getPlants } from '../lib/plants.js';
import LikeButton from '../components/LikeButton.jsx';

export default async function Page() {
  const plants = await getPlants();
  return (
    <main>
      <h1>Plants of the week</h1>
      {plants.map((plant) => (
        <div key={plant.id}>
          <h2>{plant.name}</h2>
          <LikeButton plantId={plant.id} />
        </div>
      ))}
    </main>
  );
}
