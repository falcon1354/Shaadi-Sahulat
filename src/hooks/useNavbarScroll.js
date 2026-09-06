import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to handle Navbar auto-hide on scroll down
 * and reappear ONLY when scrolled back to the very top (scrollTop === 0).
 */
export function useNavbarScroll() {
  const [visible, setVisible] = useState(true);
  const scrollRef = useRef(null);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    const handleScroll = (scrollTop) => {
      const lastScrollTop = lastScrollTopRef.current;

      if (scrollTop === 0) {
        setVisible(true);
      } else if (scrollTop > lastScrollTop && scrollTop > 10) {
        // Scrolling down -> hide navbar
        setVisible(false);
      }
      // Note: If scrolling up but not at top (scrollTop > 0), stays hidden per spec requirement

      lastScrollTopRef.current = scrollTop;
    };

    const targetEl = scrollRef.current;
    if (targetEl) {
      const onContainerScroll = () => handleScroll(targetEl.scrollTop);
      targetEl.addEventListener('scroll', onContainerScroll);
      return () => targetEl.removeEventListener('scroll', onContainerScroll);
    } else {
      const onWindowScroll = () => handleScroll(window.scrollY || document.documentElement.scrollTop);
      window.addEventListener('scroll', onWindowScroll);
      return () => window.removeEventListener('scroll', onWindowScroll);
    }
  }, []);

  return { visible, scrollRef };
}
