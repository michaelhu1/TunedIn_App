import { ImageResponse } from "next/og";

// The app icon, drawn in code so there is no image file to keep in sync.
export const size = { width: 180, height: 180 };
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
          fontSize: 99,
          fontWeight: 800,
        }}
      >
        T
      </div>
    ),
    size,
  );
}
