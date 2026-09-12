import { createRender as render, createOptionalRender } from "./element-factories.js";
import type { ComponentProps } from "react";

export function TableCell(props: ComponentProps<"td">) {
  return <td {...props} />;
}

export function TableCaption(props: ComponentProps<"caption">) {
  return <caption {...props} />;
}

export function FactoryTable({ cell, caption }: {
  cell: ComponentProps<"td">;
  caption: ComponentProps<"caption"> | null;
}) {
  return (
    <table>
      {createOptionalRender(TableCaption, caption)}
      <tbody><tr>{render(TableCell, cell)}</tr></tbody>
    </table>
  );
}
