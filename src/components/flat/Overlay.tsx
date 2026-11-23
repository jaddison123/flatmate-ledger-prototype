// HTML pinned to a point in the 3D scene (labels, the chat bubble). It plays the role of drei's
// <Html>, which threw "removeChild ... not a child of this node" when the whole scene unmounted
// (switching to the list view): it unmounts its own React root in the middle of React's commit.
// Here each label gets a small React root that is unmounted after the commit instead.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import type { Vec3 } from "./rooms";

interface OverlayProps {
  position: Vec3;
  /** Class of the element holding `children` (centred on the point). */
  className?: string;
  /** Let the content receive clicks (labels are click-through by default). */
  interactive?: boolean;
  children: ReactNode;
}

const point = new Vector3();

export function Overlay({ position, className = "", interactive = false, children }: OverlayProps) {
  const anchor = useRef<Group>(null);
  const element = useRef<HTMLDivElement | null>(null);
  const root = useRef<Root | null>(null);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  // One wrapper element and root per mount, inside the canvas's own container.
  useLayoutEffect(() => {
    const container = gl.domElement.parentElement;
    if (!container) return;
    const wrapper = document.createElement("div");
    wrapper.className = `flat-overlay${interactive ? " flat-overlay-interactive" : ""}`;
    container.appendChild(wrapper);
    const ownRoot = createRoot(wrapper);
    element.current = wrapper;
    root.current = ownRoot;
    return () => {
      element.current = null;
      root.current = null;
      // After the current commit has finished.
      window.setTimeout(() => {
        ownRoot.unmount();
        wrapper.remove();
      });
    };
  }, [gl, interactive]);

  // Render the children into it on every render of this component.
  useLayoutEffect(() => {
    root.current?.render(<div className={className}>{children}</div>);
  });

  // Follow the anchor point on screen.
  useFrame(() => {
    const wrapper = element.current;
    if (!anchor.current || !wrapper) return;
    anchor.current.getWorldPosition(point).project(camera);
    const x = ((point.x + 1) / 2) * size.width;
    const y = ((1 - point.y) / 2) * size.height;
    wrapper.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  });

  return <group ref={anchor} position={position} />;
}
