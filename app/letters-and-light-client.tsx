"use client";

import dynamic from "next/dynamic";

const LettersAndLight = dynamic(
  () => import("../web/src/app/App").then((module) => module.App),
  { ssr: false },
);

export function LettersAndLightClient() {
  return <LettersAndLight />;
}
