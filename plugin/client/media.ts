const VIDEO_URL_PATTERN = /\.(?:mp4|webm)(?:[?#].*)?$/i

/** Whether a media URL points at a video; React Native's Image cannot show these. */
export function isVideoMediaUrl(url: string): boolean {
  return VIDEO_URL_PATTERN.test(url)
}

/** The first media URL React Native's Image can render: videos (mp4, webm) are skipped. */
export function firstImageMedia(media: readonly string[]): string | undefined {
  return media.find((url) => !isVideoMediaUrl(url))
}
