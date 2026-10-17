import { useState } from 'react';

export default function LikeButton({ plantId }) {
  const [liked, setLiked] = useState(false);
  return (
    <button data-plant={plantId} onClick={() => setLiked(!liked)}>
      {liked ? 'Liked' : 'Like'}
    </button>
  );
}
