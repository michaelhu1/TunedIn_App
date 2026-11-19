import { describe, expect, it } from "vitest";
import { serviceName } from "./service-name";

describe("serviceName", () => {
  it("names each supported service", () => {
    expect(serviceName("https://open.spotify.com/playlist/abc")).toBe("Spotify");
    expect(serviceName("https://music.apple.com/us/playlist/x")).toBe("Apple Music");
    expect(serviceName("https://www.youtube.com/playlist?list=1")).toBe("YouTube");
    expect(serviceName("https://music.youtube.com/playlist?list=1")).toBe("YouTube");
    expect(serviceName("https://soundcloud.com/a/sets/b")).toBe("SoundCloud");
    expect(serviceName("https://www.deezer.com/playlist/1")).toBe("Deezer");
    expect(serviceName("https://tidal.com/playlist/1")).toBe("TIDAL");
  });

  it("refuses anything else", () => {
    expect(serviceName("http://open.spotify.com/playlist/abc")).toBeNull();
    expect(serviceName("https://open.spotify.com.evil.example/x")).toBeNull();
    expect(serviceName("javascript:alert(1)")).toBeNull();
    expect(serviceName("not a url")).toBeNull();
  });
});
