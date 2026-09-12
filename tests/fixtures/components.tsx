"use client";
import { memo, useState } from "react";
import type { ComponentProps, Ref } from "react";

type Props = ComponentProps<"input">;
export const EarlyAlias = Input;
/** Keep the original public declaration and its comment. */
export function Input(props: Props) { return <input {...props} />; }
Input.displayName = "CustomInput";
Input.description = "static property";
export const Alias = Input;
export { Input as Renamed };
export default Input;

export const Arrow = (props: Props) => <input {...props} />;
export const Expression = function Inner(props: Props) { return <input {...props} />; };
export const Destructured = ({ ref, ...props }: Props) => <input {...props} ref={ref} />;
export const Memo = memo((props: Props) => <input {...props} />);
export const MemoDeclaration = memo(Input);
export const Generic = <T extends string,>({ value, ...props }: Props & { value: T }) => <input {...props} value={value} readOnly />;

function splitProps<T extends object>(props: T) { return [{}, { ...props }] as const; }
export function Indirect(props: Props) {
  const [, rest] = splitProps(props);
  return <Input {...rest} />;
}

export function Shadowed({ React, ...props }: Props & { React?: string }) {
  const __forwardRef = React;
  return <input {...props} data-shadow={__forwardRef} />;
}

export function Defaults({ ref = fallbackRef, ...props }: Props) {
  return <input {...props} ref={ref} />;
}
export const fallbackRef = { current: null as HTMLInputElement | null };
export const observed: { own: boolean; value: unknown }[] = [];
export function Observe(props: { ref?: Ref<HTMLInputElement> }) {
  observed.push({ own: Object.hasOwn(props, "ref"), value: props.ref });
  return <input ref={props.ref} />;
}

export function Avatar() {
  const [color, setColor] = useState("f59e0b");
  return <button aria-label="Change avatar color" onClick={() => setColor("6366f1")}><img src={`/${color}.png`} /></button>;
}
export function Slot(props: ComponentProps<"span"> & { kind: string }) {
  const [, rest] = splitProps(props);
  return <span {...rest} />;
}
export function Gallery() {
  const [round, setRound] = useState(true);
  const [count, setCount] = useState(0);
  return <>
    <button aria-label="Round avatar" aria-pressed={round} onClick={() => setRound(!round)}>Round</button>
    <button aria-label="Rerender" onClick={() => setCount(count + 1)}>{count}</button>
    <Slot kind={round ? "avatar" : "badge"}><Avatar /></Slot>
  </>;
}

export function Recursive({ depth = 1, ...props }: Props & { depth?: number }) {
  return depth ? <Recursive depth={depth - 1} {...props} /> : <input {...props} />;
}
