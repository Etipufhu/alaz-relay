import React from "react";
import { Composition } from "remotion";
import { Demo } from "./Demo";
import { FPS, H, TOTAL, W } from "./timing";

export const Root: React.FC = () => (
  <Composition id="AlazDemo" component={Demo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
);
