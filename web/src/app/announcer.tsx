/** Polite status announcements for screen readers — real stages, real states,
 *  no fake percentages, no focus theft. */

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";

type Announcer = (message: string) => void;

const AnnouncerContext = createContext<Announcer>(() => undefined);

export const AnnouncerProvider = ({ children }: { children: ReactNode }) => {
  const politeRef = useRef<HTMLDivElement>(null);
  const announce = useCallback((message: string) => {
    const node = politeRef.current;
    if (!node) return;
    // Clear then set so identical consecutive messages are re-announced.
    node.textContent = "";
    window.setTimeout(() => {
      if (politeRef.current) politeRef.current.textContent = message;
    }, 30);
  }, []);
  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div ref={politeRef} role="status" aria-live="polite" aria-atomic="true" className="visually-hidden" />
    </AnnouncerContext.Provider>
  );
};

export const useAnnounce = (): Announcer => useContext(AnnouncerContext);
