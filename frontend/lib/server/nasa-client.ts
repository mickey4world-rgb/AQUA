export function getNasaApiKey(): string {
  return process.env.NASA_API_KEY?.trim() || "DEMO_KEY";
}

export async function fetchNasaJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`NASA API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchJplJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) {
    throw new Error(`JPL API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
