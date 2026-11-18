import { ImageResponse } from "next/og";

// The app icon, drawn in code so there is no image file to keep in sync.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6d28d9, #db2777)",
          color: "#fff",
          fontSize: 281,
          fontWeight: 800,
        }}
      >
        T
      </div>
    ),
    size,
  );
}
