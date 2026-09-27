import { describe, expect, it } from "vitest";
import { youtubeVideoProvider } from "./provider";

const ID = "dQw4w9WgXcQ";

describe("youtubeVideoProvider.parsearRef", () => {
  it.each([
    ID,
    `  ${ID}  `,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=gy8t0Yy0cOIeXEeQ`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://youtube.com/watch?feature=share&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
    `https://www.youtube.com/shorts/${ID}?si=abc`,
    `https://www.youtube.com/live/${ID}`,
  ])("extrae el id de %s", (entrada) => {
    expect(youtubeVideoProvider.parsearRef(entrada)).toBe(ID);
  });

  it.each([
    "",
    "gy8t0Yy0cOIeXEeQ", // el `si=` de rastreo que se guardó por error (16 chars)
    "abc",
    "https://youtu.be/",
    "https://www.youtube.com/watch?v=corto",
    "https://www.youtube.com/channel/UC1234567890",
    `https://vimeo.com/${ID}`,
    `https://evil.com/watch?v=${ID}`,
    "no es un link",
  ])("rechaza %s", (entrada) => {
    expect(youtubeVideoProvider.parsearRef(entrada)).toBeNull();
  });
});
