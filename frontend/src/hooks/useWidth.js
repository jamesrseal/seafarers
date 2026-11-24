import { useLayoutEffect, useRef, useState } from 'react';

// Width of an element, kept current as the layout changes, so an SVG is drawn
// at real pixels and its text stays the same size at every screen width.
export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
