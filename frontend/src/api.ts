import type { Job } from "./types";

const UNREACHABLE = "Can't reach the song analyzer. Make sure the server is running (bash scripts/start.sh).";

async function request(path: string, init?: RequestInit): Promise<Job> {
  const res = await fetch(path, init).catch(() => {
    throw new Error(UNREACHABLE);
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? (res.status >= 500 || res.status === 404 ? UNREACHABLE : `Request failed (${res.status})`));
  return body as Job;
}

export function submitYouTube(url: string): Promise<Job> {
  return request("/api/jobs/youtube", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

export function submitUpload(file: File): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/jobs/upload", { method: "POST", body: form });
}

/** Poll a job until it finishes, reporting each status change. */
export async function waitForJob(job: Job, onUpdate: (job: Job) => void, intervalMs = 1500): Promise<Job> {
  onUpdate(job);
  while (job.status !== "done" && job.status !== "error") {
    await new Promise((r) => setTimeout(r, intervalMs));
    job = await request(`/api/jobs/${job.id}`);
    onUpdate(job);
  }
  return job;
}
