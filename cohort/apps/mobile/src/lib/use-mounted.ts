import { useEffect, useState } from 'react';

/** True after mount on the client. Static-export HTML and the first hydration
 * render both see false, so markup that depends on URL params or other
 * client-only values stays identical to the served HTML until hydration
 * completes (prevents React error #418), then re-renders with the real value. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Deferred past the effect body (react-hooks/set-state-in-effect).
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);
  return mounted;
}
