import { cloneElement, createElement, isValidElement } from "react";
import type { ComponentType, ReactElement } from "react";

export function createRender<P extends object>(Component: ComponentType<P>, props: P | ReactElement) {
  if (isValidElement(props)) return cloneElement(props);
  return createElement(Component, props as P);
}

export function createOptionalRender<P extends object>(Component: ComponentType<P>, props: P | ReactElement | null | false) {
  if (props == null || props === false) return null;
  return createRender(Component, props);
}
