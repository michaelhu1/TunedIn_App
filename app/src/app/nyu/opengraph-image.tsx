import { ImageResponse } from "next/og";
import { getPublicChart } from "@/lib/public-charts";

// The picture that appears when someone pastes the charts link into iMessage, Instagram,
// Slack and so on: the week's top three songs. Drawn in code from the same data as the page.
export const revalidate = 300;
export const alt = "NYU this week on TunedIn";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Note: the image renderer requires every <div> to state its layout, hence display: "flex" everywhere.
export default async function Image() {
  const { status, tracks } = await getPublicChart(null);
  const top = status.unlocked ? tracks.slice(0, 3) : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: 64, color: "#fff", background: "linear-gradient(135deg, #6d28d9, #db2777)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, opacity: 0.85 }}>TunedIn</div>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, marginTop: 8 }}>NYU this week</div>
        </div>

        {top.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {top.map((t) => (
              <div key={t.track_id} style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ display: "flex", fontSize: 44, fontWeight: 800, width: 50 }}>{t.rank}</div>
                {t.artwork_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.artwork_url} width={92} height={92} style={{ borderRadius: 12 }} alt="" />
                ) : (
                  <div style={{ display: "flex", width: 92, height: 92, borderRadius: 12, background: "rgba(255,255,255,0.2)" }} />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{t.title.slice(0, 34)}</div>
                  <div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>{t.artist.slice(0, 40)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 44, fontWeight: 600 }}>What NYU has on repeat. Join to count.</div>
        )}
      </div>
    ),
    size,
  );
}
