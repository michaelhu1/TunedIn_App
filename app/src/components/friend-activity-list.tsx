import Link from "next/link";
import { timeAgo, type FriendActivity } from "@/lib/friends";
import Avatar from "@/components/avatar";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";

// A list of friends with what each is playing today. Used on Home (a short version) and on
// the People tab (everyone). Friends who have not played anything today are shown quietly
// at the end, unless `activeOnly` is set.
export default function FriendActivityList({ friends, activeOnly = false }: { friends: FriendActivity[]; activeOnly?: boolean }) {
  const rows = activeOnly ? friends.filter((f) => f.track) : friends;
  return (
    <ul className="flex flex-col">
      {rows.map((f) => (
        <li key={f.userId} className={`flex items-center gap-3 py-2.5 ${f.track ? "" : "opacity-50"}`}>
          <Link href={`/u/${f.handle}`} className="relative shrink-0" aria-label={`@${f.handle}'s profile`}>
            <Avatar handle={f.handle} src={f.avatarUrl} size={44} />
            {f.live && (
              <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-green-500" />
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <Link href={`/u/${f.handle}`} className="font-semibold">
                {f.displayName ?? `@${f.handle}`}
              </Link>
              <span className="opacity-60">
                {f.track ? (f.live ? " · listening now" : ` · ${timeAgo(f.updatedAt!)}`) : " · nothing yet today"}
              </span>
            </p>
            {f.track && (
              <p className="truncate text-sm">
                <span className="font-medium">{f.track.title}</span>
                <span className="opacity-60"> · {f.track.artist}</span>
              </p>
            )}
          </div>
          {f.track && (
            <>
              <Cover src={f.track.artworkUrl} size={44} />
              <PreviewButton trackId={f.track.id} />
              <OpenInSpotify trackId={f.track.id} compact />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
