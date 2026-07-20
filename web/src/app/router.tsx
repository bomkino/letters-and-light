/** Hash router: route names only. No answers, copy, hashes, or any user state
 *  ever enters the URL — the hash carries nothing but a page name. */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type RoutePath = "/" | "/collection" | "/method" | "/studio" | "/open";

const readHash = (): RoutePath => {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "/collection" || hash === "/method" || hash === "/studio" || hash === "/open") return hash;
  return "/";
};

type RouterValue = {
  path: RoutePath;
  navigate: (path: RoutePath) => void;
};

const RouterContext = createContext<RouterValue | null>(null);

export const RouterProvider = ({ children, onRouteChange }: { children: ReactNode; onRouteChange?: (path: RoutePath) => void }) => {
  const [path, setPath] = useState<RoutePath>(() => readHash());

  useEffect(() => {
    const onHash = () => {
      const next = readHash();
      setPath((current) => {
        if (current !== next) onRouteChange?.(next);
        return next;
      });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [onRouteChange]);

  const navigate = useCallback(
    (next: RoutePath) => {
      if (readHash() !== next) {
        window.location.hash = next;
      }
      setPath((current) => {
        if (current !== next) onRouteChange?.(next);
        return next;
      });
    },
    [onRouteChange],
  );

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
};

export const useRouter = (): RouterValue => {
  const context = useContext(RouterContext);
  if (!context) throw new Error("useRouter must be used inside RouterProvider");
  return context;
};

/** Accessible route link: a real anchor (href="#/path") so middle-click and
 *  screen readers behave, with client-side navigation on activate. */
export const Link = ({
  to,
  children,
  className,
  onClick,
}: {
  to: RoutePath;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) => {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
};
