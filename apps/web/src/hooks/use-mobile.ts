import * as React from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mediaQuery.matches);

    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isMobile;
}
