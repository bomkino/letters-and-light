/** App shell: providers, skip link, persistent chrome, route switch.
 *  Route changes restore focus to the page heading and announce the page. */

import { useCallback, useEffect, useRef } from "react";

import { AnnouncerProvider, useAnnounce } from "./announcer";
import { Footer, Header } from "./chrome";
import { RouterProvider, useRouter, type RoutePath } from "./router";
import { StudioProvider } from "./store";
import { CollectionPage } from "../pages/Collection";
import { Home } from "../pages/Home";
import { MethodPage } from "../pages/Method";
import { ProjectOpenPage } from "../pages/ProjectOpen";
import { Studio } from "../pages/Studio";

const PAGE_NAMES: Record<RoutePath, string> = {
  "/": "Letters and Light, home",
  "/collection": "Font sources",
  "/method": "How Letters and Light works",
  "/studio": "Your Letters and Light studio",
  "/open": "Open a saved project",
};

const Routes = () => {
  const { path } = useRouter();
  const announce = useAnnounce();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const heading = mainRef.current?.querySelector<HTMLElement>("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    announce(PAGE_NAMES[path]);
  }, [path, announce]);

  return (
    <main id="main" ref={mainRef} tabIndex={-1} className="site-main">
      {path === "/" ? <Home /> : null}
      {path === "/collection" ? <CollectionPage /> : null}
      {path === "/method" ? <MethodPage /> : null}
      {path === "/studio" ? <Studio /> : null}
      {path === "/open" ? <ProjectOpenPage /> : null}
    </main>
  );
};

const Shell = () => {
  const onRouteChange = useCallback((_path: RoutePath) => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);
  return (
    <RouterProvider onRouteChange={onRouteChange}>
      <a className="skip-link" href="#main">
        Skip to the studio
      </a>
      <Header />
      <Routes />
      <Footer />
    </RouterProvider>
  );
};

export const App = () => (
  <AnnouncerProvider>
    <StudioProvider>
      <Shell />
    </StudioProvider>
  </AnnouncerProvider>
);
