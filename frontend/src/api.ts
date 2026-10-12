// The optional server only fetches YouTube audio; analysis happens in the browser.

const API = `${import.meta.env.BASE_URL}api`;

/** True when a server that can fetch YouTube audio is running behind this page. */
export async function youtubeAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`);
    return res.ok && (await res.json()).youtube === true;
  } catch {
    return false;
  }
}

export async function fetchYouTubeAudio(url: string): Promise<{ data: ArrayBuffer; title: string }> {
  const res = await fetch(`${API}/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => {
    throw new Error("Can't reach the server to get that video.");
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Couldn't get the audio for that video.");
  }
  const title = decodeURIComponent(res.headers.get("X-Title") ?? "YouTube song");
  return { data: await res.arrayBuffer(), title };
}
