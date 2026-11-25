
import { useEffect, useRef, useState } from 'react';
import { Monitor } from 'lucide-react';

const cache = new Map();
const pending = new Map();
let timer;

async function loadPending() {
  const entries = [...pending.entries()].filter(([, item]) => !item.loading).slice(0, 100);
  if (!entries.length) return;
  for (const [, item] of entries) item.loading = true;
  const data = await window.associationManager.icons(entries.map(([key]) => key)).catch(() => ({}));
  for (const [key, item] of entries) {
    const icon = data[key] || null;
    cache.set(key, icon);
    pending.delete(key);
    item.resolve(icon);
  }
  void loadPending();
}

function requestIcon(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (!pending.has(id)) {
    const promise = new Promise((resolve) => {
      pending.set(id, { resolve });
      clearTimeout(timer);
      timer = setTimeout(loadPending, 24);
    });
    pending.get(id).promise = promise;
  }
  return pending.get(id).promise;
}

export function AppIcon({ app, size = 19 }) {
  const ref = useRef(null);
  const id = app?.id;
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!id || !window.associationManager) return;
    let active = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      requestIcon(id).then((icon) => { if (active) setLoaded({ id, icon }); });
    });
    observer.observe(ref.current);
    return () => { active = false; observer.disconnect(); };
  }, [id]);
  const image = id && (cache.get(id) || (loaded?.id === id && loaded.icon));
  return <span ref={ref} className="app-icon" aria-hidden="true">
    {image ? <img src={image} alt="" width={size} height={size} /> : <Monitor size={size} />}
  </span>;
}
