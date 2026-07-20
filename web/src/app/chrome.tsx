import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { flushSync } from "react-dom";

import { copy } from "@core/index.js";

import { useRouter } from "./router";

type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const systemTheme = (): ResolvedTheme =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const ThemeToggle = () => {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>(() => systemTheme());

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = preference === "system" ? (query.matches ? "dark" : "light") : preference;
      setResolved(next);
      document.documentElement.dataset.theme = next;
      document.documentElement.dataset.themeMode = preference;
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [preference]);

  const nextPreference = (): ThemePreference => {
    if (preference === "system") return resolved === "dark" ? "light" : "dark";
    if (preference === "dark") return "light";
    return "system";
  };

  const label =
    preference === "system"
      ? `Theme follows your device. Currently ${resolved}.`
      : `Theme is ${preference}.`;

  const changeTheme = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const next = nextPreference();
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => { ready: Promise<void> };
    };
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!transitionDocument.startViewTransition || reduced) {
      setPreference(next);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = transitionDocument.startViewTransition(() => {
      flushSync(() => setPreference(next));
    });
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 640,
          easing: "cubic-bezier(0.32, 0.72, 0, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      data-mode={preference}
      aria-label={`${label} Change theme.`}
      title={`${label} Click to change.`}
      onClick={changeTheme}
    >
      <span aria-hidden="true" className="theme-glyph">
        {preference === "system" ? "◐" : resolved === "dark" ? "☾" : "☀"}
      </span>
    </button>
  );
};

export const Header = () => {
  const { path, navigate } = useRouter();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a
          className="site-brand"
          href="#/"
          onClick={(event) => {
            event.preventDefault();
            navigate("/");
          }}
          aria-label="Letters & Light by pitch.dog — home"
        >
          <span className="site-brand-name">Letters &amp; Light</span>
          <span className="site-brand-byline">by pitch.dog</span>
        </a>
        <div className="site-header-actions">
          {path !== "/" ? (
            <a
              className="quiet-link"
              href="#/"
              onClick={(event) => {
                event.preventDefault();
                navigate("/");
              }}
            >
              Home
            </a>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

/** Kept as an exported compatibility seam. Candidate truth now appears where
 * it matters—beside type results—not as permanent chrome. */
export const CandidateBanner = () => null;

export const Footer = () => {
  const { navigate } = useRouter();
  const links = [
    { label: "How it works", path: "/method" as const },
    { label: "Font sources", path: "/collection" as const },
    { label: "Open saved project", path: "/open" as const },
  ];

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <img src="./assets/brand/RectangleA_logomark-fullcolor-rgb.svg" alt="" width="23" height="48" />
          <p className="footer-line">{copy.footer.line}</p>
        </div>
        <nav aria-label="Footer">
          {links.map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
            >
              {item.label}
            </a>
          ))}
          <a href="https://pitch.dog" target="_blank" rel="noreferrer">
            Visit pitch.dog ↗
          </a>
        </nav>
      </div>
    </footer>
  );
};
