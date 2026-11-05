// The before and after proof pictures (M69 step 3), drawn in the receipt. M71 part 2: the Last fix, Since then and practice
// cards that stood here are gone; Now at rest is its lead and the one grouped list (card.tsx, homeRest.ts nowRows).
import { S } from "./strings.ts";

/** M69 step 3: the before and after pair, each in a small browser frame with a word under it. Only the after picture when
 *  the earlier version could not be pictured. Pictures of the app being built, made by the hidden browser (never the
 *  person's screen). `host`: the address the browser check really opened, when the engine says one; the bar stays empty
 *  otherwise (step 4: a folder's name there would look like an address the page was loaded from). */
export function ShotPair({ before, after, host, caption, size = "card" }: { before?: string; after: string; host?: string; caption?: string; size?: "card" | "receipt" }) {
  const frame = (img: string, word: string, alt: string) => (
    <figure className="now-shot">
      <div className="now-shot-frame">
        <div className="now-shot-bar" aria-hidden="true"><span /><span /><span />{host && <code>{host}</code>}</div>
        <img src={`data:image/jpeg;base64,${img}`} alt={alt} />
      </div>
      <figcaption>{word}</figcaption>
    </figure>
  );
  return (
    <div className="shot-pair" data-size={size} data-two={before ? "" : undefined}>
      {before && frame(before, S.homeNow.before, S.homeNow.pictureBefore)}
      {frame(after, before ? S.homeNow.after : caption || S.homeNow.after, caption || S.homeNow.picture)}
      {before && caption && <p className="shot-caption">{caption}</p>}
    </div>
  );
}
