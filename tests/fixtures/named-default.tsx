import type { ComponentProps } from "react";
export const EarlyAlias = NamedDefault;
export default function NamedDefault(props: ComponentProps<"input">) { return <input {...props} />; }
export { NamedDefault as Alias };
