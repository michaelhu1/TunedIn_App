import Link from "next/link";
import { namesLine, timeAgo, type FriendActivity, type FriendsToday, type Moment } from "@/lib/friends";
import Avatar from "@/components/avatar";
import Cover from "@/components/cover";
import FeltButton from "@/components/felt-button";
import PreviewButton from "@/components/preview-button";

// Friends on Home. Instead of one row per friend, the screen is built from what is worth
// noticing right now:
//   Moments        up to three cards: someone felt your song, you both played the same
//                  song, friends are going to the same concert
//   On now         friends listening in the last 30 minutes (five, then "show more")
//   Earlier today  a strip of faces that scrolls sideways, so twenty friends take one row
//   Quiet today    a single line; nobody gets a row for doing nothing
// Inside each group, friends whose listening overlaps most with yours come first.

const ON_NOW_SHOWN = 5;

function Label({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">{children}</h2>;
}

const concertDate = (ymd: string | null) =>
  ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;

function MomentCard({ moment, data }: { moment: Moment; data: FriendsToday }) {
  if (moment.kind === "concert") {
    const names = moment.friends.map((f) => f.name);
    const date = concertDate(moment.eventDate);
    const first = moment.friends[0];
    return (
      <li className="flex items-center gap-3 rounded-xl bg-surface p-3">
        <Link href={`/u/${first.handle}`} className="flex shrink-0 -space-x-3" aria-label={`${first.name}'s profile`}>
          {moment.friends.slice(0, 2).map((f) => (
            <span key={f.userId} className="rounded-full border-2 border-surface">
              <Avatar handle={f.handle} src={f.avatarUrl} size={40} />
            </span>
          ))}
        </Link>
        <p className="min-w-0 flex-1 text-sm">
          {moment.includesMe ? (
            <>
              You and <span className="font-semibold">{namesLine(names)}</span> are going to{" "}
            </>
          ) : (
            <>
              <span className="font-semibold">{namesLine(names)}</span> are going to{" "}
            </>
          )}
          <span className="font-semibold">{moment.artist}</span>
          {date && <span className="opacity-70"> · {date}</span>}
        </p>
      </li>
    );
  }

  const { friend, track } = moment;
  // "Felt this" is offered only when this is the song the friend is showing right now.
  const showing = [...data.onNow, ...data.earlier].find((f) => f.userId === friend.userId)?.track?.id === track.id;
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface p-3">
      <Link href={`/u/${friend.handle}`} className="shrink-0" aria-label={`${friend.name}'s profile`}>
        <Avatar handle={friend.handle} src={friend.avatarUrl} size={40} />
      </Link>
      <p className="min-w-0 flex-1 text-sm">
        {moment.kind === "felt" ? (
          <>
            <span className="font-semibold">{friend.name}</span> felt your <span className="font-semibold">{track.title}</span>
          </>
        ) : (
          <>
            You and <span className="font-semibold">{friend.name}</span> both had <span className="font-semibold">{track.title}</span> on today
          </>
        )}
        <span className="opacity-70"> · {track.artist}</span>
      </p>
      {moment.kind === "same-song" && showing && (
        <FeltButton friendId={friend.userId} trackId={track.id} name={friend.name} felt={data.feltByMe.includes(`${friend.userId}:${track.id}`)} />
      )}
      <Cover src={track.artworkUrl} size={40} />
    </li>
  );
}

function NowRow({ f, felt }: { f: FriendActivity; felt: boolean }) {
  const name = f.displayName ?? `@${f.handle}`;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Link href={`/u/${f.handle}`} className="relative shrink-0" aria-label={`${name}'s profile`}>
        <Avatar handle={f.handle} src={f.avatarUrl} size={44} />
        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-live" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/u/${f.handle}`} className="block truncate text-sm font-semibold">
          {name}
        </Link>
        <p className="truncate text-sm">
          <span className="font-medium">{f.track!.title}</span>
          <span className="opacity-60"> · {f.track!.artist}</span>
        </p>
      </div>
      <FeltButton friendId={f.userId} trackId={f.track!.id} name={name} felt={felt} />
      <PreviewButton trackId={f.track!.id} />
    </li>
  );
}

export default function FriendsTodaySections({ data }: { data: FriendsToday }) {
  const { moments, onNow, earlier, quiet, feltByMe } = data;
  const felt = (f: FriendActivity) => feltByMe.includes(`${f.userId}:${f.track!.id}`);
  const nobodyToday = onNow.length === 0 && earlier.length === 0;

  return (
    <>
      {moments.length > 0 && (
        <section>
          <Label>Moments</Label>
          <ul className="flex flex-col gap-2">
            {moments.map((m) => (
              <MomentCard key={m.key} moment={m} data={data} />
            ))}
          </ul>
        </section>
      )}

      {onNow.length > 0 && (
        <section>
          <Label>
            <span className="text-live" aria-hidden>● </span>On now
          </Label>
          <ul className="flex flex-col">
            {onNow.slice(0, ON_NOW_SHOWN).map((f) => (
              <NowRow key={f.userId} f={f} felt={felt(f)} />
            ))}
          </ul>
          {onNow.length > ON_NOW_SHOWN && (
            <details className="group">
              <summary className="cursor-pointer py-1 text-sm underline opacity-70 group-open:hidden">
                {onNow.length - ON_NOW_SHOWN} more listening now
              </summary>
              <ul className="flex flex-col">
                {onNow.slice(ON_NOW_SHOWN).map((f) => (
                  <NowRow key={f.userId} f={f} felt={felt(f)} />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {earlier.length > 0 && (
        <section>
          <Label>Earlier today</Label>
          {/* One row that scrolls sideways: a face, the song, and a tap to respond. */}
          <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
            {earlier.map((f) => {
              const name = f.displayName ?? `@${f.handle}`;
              return (
                <li key={f.userId} className="flex w-28 shrink-0 snap-start flex-col items-center gap-1.5 text-center">
                  <Link href={`/u/${f.handle}`} className="relative" aria-label={`${name}'s profile`}>
                    <Avatar handle={f.handle} src={f.avatarUrl} size={64} />
                    <span className="absolute -bottom-1 -right-1 rounded-md border-2 border-background">
                      <Cover src={f.track!.artworkUrl} size={28} />
                    </span>
                  </Link>
                  <p className="w-full truncate text-xs font-semibold">{name}</p>
                  <p className="w-full truncate text-xs">{f.track!.title}</p>
                  <p className="-mt-1.5 w-full truncate text-xs opacity-60">
                    {f.track!.artist} · {timeAgo(f.updatedAt!)}
                  </p>
                  <FeltButton friendId={f.userId} trackId={f.track!.id} name={name} felt={felt(f)} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {quiet.length > 0 && (
        <Link href="/friends" className="flex items-center gap-3 text-sm">
          <span className="flex shrink-0 -space-x-2">
            {quiet.slice(0, 4).map((f) => (
              <span key={f.userId} className="rounded-full border-2 border-background">
                <Avatar handle={f.handle} src={f.avatarUrl} size={28} />
              </span>
            ))}
          </span>
          <span className="min-w-0 flex-1 opacity-70">
            {nobodyToday
              ? `No songs from your friends yet today. ${quiet.length === 1 ? "They" : "All " + quiet.length} will show up here when they play something.`
              : `${namesLine(quiet.map((f) => f.displayName ?? `@${f.handle}`))} ${quiet.length === 1 ? "has" : "have"} not played anything yet today`}
          </span>
        </Link>
      )}
    </>
  );
}
