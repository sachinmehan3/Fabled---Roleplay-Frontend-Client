import { useEffect, useState } from 'react';
import { api } from '@/api';

// Pictures live in IndexedDB as bytes. Each is turned into an object URL once
// and kept for the life of the page: an id never changes what it points to,
// since a new upload always gets a new id.
const urls = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function load(id: string): Promise<string | null> {
  let p = pending.get(id);
  if (!p) {
    p = api
      .getImage(id)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null)
      .then((url) => {
        urls.set(id, url);
        return url;
      });
    pending.set(id, p);
  }
  return p;
}

/** A displayable URL for a stored picture, or null while it loads or if there is none. */
export function useImageUrl(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? (urls.get(id) ?? null) : null));
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    if (urls.has(id)) {
      setUrl(urls.get(id) ?? null);
      return;
    }
    let live = true;
    load(id).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}
