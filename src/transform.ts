import MagicString from "magic-string";
import { extractAssignedNames } from "@rollup/pluginutils";
import { parseSync, visitorKeys } from "oxc-parser";
import type {
  Expression,
  Function as FunctionNode,
  ArrowFunctionExpression,
  Node,
  Program,
} from "oxc-parser";
import type { Options } from "./index.js";

type Component = FunctionNode | ArrowFunctionExpression;
const marker = "@react-forward-ref transformed";
const reactMethods = ["memo", "forwardRef", "createElement"] as const;
type ReactMethod = (typeof reactMethods)[number];

function walk(node: Node, visit: (node: Node) => boolean | void) {
  if (visit(node) === false) return;
  const fields = node as unknown as Record<string, Node | Node[] | null>;
  for (const key of visitorKeys[node.type] ?? []) {
    const value = fields[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child) walk(child, visit);
    } else if (value) {
      walk(value, visit);
    }
  }
}

function isFunction(node: Node): node is Component {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function unwrap(expression: Expression): Expression {
  if (
    expression.type === "ParenthesizedExpression" ||
    expression.type === "TSAsExpression" ||
    expression.type === "TSSatisfiesExpression" ||
    expression.type === "TSNonNullExpression" ||
    expression.type === "TSTypeAssertion"
  ) {
    return unwrap(expression.expression);
  }
  return expression;
}

function hasJSX(component: Component) {
  let found = false;
  if (!component.body) return false;
  walk(component.body, (node) => {
    // A factory or a utility that contains another component is not itself a
    // component. Class bodies also establish a separate render scope.
    if (
      isFunction(node) ||
      node.type === "ClassExpression" ||
      node.type === "ClassDeclaration"
    )
      return false;
    if (node.type === "JSXElement" || node.type === "JSXFragment") {
      found = true;
      return false;
    }
  });
  return found;
}

function canWrap(component: Component) {
  if (
    component.async ||
    component.generator ||
    !component.body ||
    component.params.length > 1
  )
    return false;
  const parameter = component.params[0];
  const pattern =
    parameter?.type === "AssignmentPattern" ? parameter.left : parameter;
  if (
    pattern &&
    pattern.type !== "Identifier" &&
    pattern.type !== "ObjectPattern"
  )
    return false;
  // A named expression has an immutable private self binding. Wrapping it
  // would leave recursive JSX/static references pointing to the raw function.
  if (component.type === "FunctionExpression" && component.id) {
    const name = component.id.name;
    let selfReference = false;
    walk(component.body, (node) => {
      if (
        (node.type === "Identifier" || node.type === "JSXIdentifier") &&
        node.name === name
      )
        selfReference = true;
    });
    if (selfReference) return false;
  }
  return hasJSX(component);
}

function reactCalls(program: Program) {
  const namespaces = new Set<string>();
  const methods = {
    memo: new Set<string>(),
    forwardRef: new Set<string>(),
    createElement: new Set<string>(),
  };
  for (const statement of program.body) {
    if (
      statement.type !== "ImportDeclaration" ||
      statement.source.value !== "react" ||
      statement.importKind === "type"
    )
      continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") {
        namespaces.add(specifier.local.name);
      } else if (specifier.importKind !== "type") {
        const imported =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value;
        for (const method of reactMethods) {
          if (imported === method) methods[method].add(specifier.local.name);
        }
      }
    }
  }
  const matches = (expression: Expression, method: ReactMethod) => {
    const callee = unwrap(expression);
    if (callee.type === "Identifier") return methods[method].has(callee.name);
    if (
      callee.type !== "MemberExpression" ||
      callee.object.type !== "Identifier" ||
      !namespaces.has(callee.object.name)
    )
      return false;
    if (callee.computed)
      return (
        callee.property.type === "Literal" && callee.property.value === method
      );
    return (
      callee.property.type === "Identifier" && callee.property.name === method
    );
  };
  // Only module bindings can identify a module-level memo initializer. A
  // nested alias with the same name must not classify an unrelated HOC.
  let changed = true;
  while (changed) {
    changed = false;
    for (const statement of program.body) {
      const declaration =
        statement.type === "ExportNamedDeclaration"
          ? statement.declaration
          : statement;
      if (
        declaration?.type !== "VariableDeclaration" ||
        declaration.kind !== "const"
      )
        continue;
      for (const variable of declaration.declarations) {
        if (variable.id.type !== "Identifier" || !variable.init) continue;
        const name = variable.id.name;
        for (const method of reactMethods) {
          const bindings = methods[method];
          if (!bindings.has(name) && matches(variable.init, method)) {
            bindings.add(name);
            changed = true;
          }
        }
      }
    }
  }
  return matches;
}

function elementFactoryCalls(
  program: Program,
  factories: NonNullable<Options["elementFactories"]>,
) {
  const localNames = new Map<string, Set<number>>();
  function add(name: string, index: number) {
    const indices = localNames.get(name) ?? new Set<number>();
    indices.add(index);
    localNames.set(name, indices);
  }
  // Match imports conservatively: a same-named binding in any nested scope
  // disables import-based trust for that name throughout the module.
  const shadowed = new Set<string>();
  function bind(pattern: Node) {
    if (pattern.type === "TSParameterProperty") {
      bind(pattern.parameter);
      return;
    }
    for (const name of extractAssignedNames(pattern)) shadowed.add(name);
  }
  walk(program, (node) => {
    if (isFunction(node)) {
      if (node.type !== "ArrowFunctionExpression" && node.id) bind(node.id);
      for (const parameter of node.params) bind(parameter);
    } else if (node.type === "VariableDeclarator") {
      bind(node.id);
    } else if (node.type === "CatchClause" && node.param) {
      bind(node.param);
    } else if (
      (node.type === "ClassDeclaration" ||
        node.type === "ClassExpression" ||
        node.type === "TSEnumDeclaration" ||
        node.type === "TSModuleDeclaration" ||
        node.type === "TSImportEqualsDeclaration") &&
      node.id?.type === "Identifier"
    ) {
      bind(node.id);
    }
  });
  for (const factory of factories) {
    if (typeof factory === "string") {
      add(factory, 0);
      continue;
    }
    for (const statement of program.body) {
      if (
        statement.type !== "ImportDeclaration" ||
        statement.importKind === "type" ||
        statement.source.value !== factory.source
      )
        continue;
      for (const specifier of statement.specifiers) {
        if (shadowed.has(specifier.local.name)) continue;
        let imported: string;
        if (specifier.type === "ImportDefaultSpecifier") {
          imported = "default";
        } else if (
          specifier.type === "ImportSpecifier" &&
          specifier.importKind !== "type"
        ) {
          imported =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : specifier.imported.value;
        } else {
          continue;
        }
        if (imported === factory.imported)
          add(specifier.local.name, factory.argumentIndex ?? 0);
      }
    }
  }
  return (callee: Expression, index: number) =>
    callee.type === "Identifier" && localNames.get(callee.name)?.has(index);
}

export function transform(
  code: string,
  id: string,
  elementFactories: NonNullable<Options["elementFactories"]> = [],
) {
  const typescript = /\.[cm]?tsx?$/.test(id);
  const parsed = parseSync(id, code, {
    sourceType: "module",
    lang: typescript ? (id.endsWith("x") ? "tsx" : "ts") : "jsx",
  });
  if (parsed.errors.length) {
    throw new Error(
      `react-forward-ref: Cannot parse ${id}: ${parsed.errors[0]?.message}`,
    );
  }
  if (parsed.comments.some((comment) => comment.value.trim() === marker))
    return null;
  const { program } = parsed;
  const isReactCall = reactCalls(program);
  const isElementFactory = elementFactories.length
    ? elementFactoryCalls(program, elementFactories)
    : () => false;
  const names = new Set<string>();
  const renderFunctions = new Set<string>();
  const aliases = new Map<string, Set<string>>();
  walk(program, (node) => {
    if (node.type === "Identifier" || node.type === "JSXIdentifier")
      names.add(node.name);
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init
    ) {
      const value = unwrap(node.init);
      if (value.type === "Identifier") {
        const originals = aliases.get(node.id.name) ?? new Set<string>();
        originals.add(value.name);
        aliases.set(node.id.name, originals);
      }
    }
    if (node.type !== "CallExpression" && node.type !== "NewExpression") return;
    const callee = unwrap(node.callee);
    // A forwardRef object cannot be called or constructed as a function.
    if (callee.type === "Identifier") renderFunctions.add(callee.name);
    if (
      callee.type === "MemberExpression" &&
      callee.object.type === "Identifier" &&
      callee.property.type === "Identifier" &&
      ["call", "apply", "bind"].includes(callee.property.name)
    )
      renderFunctions.add(callee.object.name);
    const isElementCall =
      isReactCall(callee, "memo") || isReactCall(callee, "createElement");
    // Opaque HOCs may call forwardRef themselves. Leave their render inputs
    // alone instead of ever handing them an already wrapped object.
    let spread = false;
    for (const [index, argument] of node.arguments.entries()) {
      if (argument.type === "SpreadElement") {
        spread = true;
        continue;
      }
      if (
        node.type === "CallExpression" &&
        !spread &&
        ((isElementCall && index === 0) || isElementFactory(callee, index))
      )
        continue;
      const render = unwrap(argument);
      if (render.type === "Identifier") renderFunctions.add(render.name);
    }
  });
  for (const name of renderFunctions) {
    for (const original of aliases.get(name) ?? [])
      renderFunctions.add(original);
  }
  function unique(base: string) {
    let name = base;
    let suffix = 0;
    while (names.has(name)) name = `${base}${++suffix}`;
    names.add(name);
    return name;
  }
  const wrap = unique("__reactForwardRef");
  const forwardRef = unique("__forwardRef");
  const output = new MagicString(code);
  const declarations: string[] = [];
  let changed = false;

  function select(component: Component, name: string, isDefault = false) {
    if (
      (!isDefault && !/^[A-Z]/.test(name)) ||
      /^use[A-Z0-9]/.test(name) ||
      renderFunctions.has(name) ||
      !canWrap(component)
    )
      return;
    changed = true;
    if (component.type === "FunctionDeclaration" && component.id) {
      const binding = typescript ? `(${name} as typeof ${name})` : name;
      declarations.push(
        `${binding} = /* @__PURE__ */ ${wrap}(${name}, ${JSON.stringify(name)});`,
      );
    } else {
      output.appendLeft(component.start, `/* @__PURE__ */ ${wrap}(`);
      const terminator = component.type === "FunctionDeclaration" ? ";" : "";
      output.appendRight(
        component.end,
        `, ${JSON.stringify(name)})${terminator}`,
      );
    }
  }

  function selectExpression(
    expression: Expression,
    name: string,
    isDefault = false,
  ) {
    const node = unwrap(expression);
    if (isFunction(node)) {
      select(node, name, isDefault);
    } else if (
      node.type === "CallExpression" &&
      isReactCall(node.callee, "memo")
    ) {
      const argument = node.arguments[0];
      if (argument && argument.type !== "SpreadElement") {
        const render = unwrap(argument);
        if (isFunction(render)) select(render, name, isDefault);
      }
    }
  }

  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = statement.declaration;
      if (declaration.type === "FunctionDeclaration") {
        select(declaration, declaration.id?.name ?? "default", true);
      } else if (
        declaration.type !== "ClassDeclaration" &&
        declaration.type !== "TSInterfaceDeclaration"
      ) {
        selectExpression(declaration, "default", true);
      }
      continue;
    }
    const declaration =
      statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (declaration?.type === "FunctionDeclaration" && declaration.id) {
      select(declaration, declaration.id.name);
    } else if (
      declaration?.type === "VariableDeclaration" &&
      declaration.kind === "const"
    ) {
      for (const variable of declaration.declarations) {
        if (variable.id.type === "Identifier" && variable.init)
          selectExpression(variable.init, variable.id.name);
      }
    }
  }
  if (!changed) return null;

  // TypeScript's generic identity signature keeps the source component's
  // call signature, including generic props. This is a runtime-only adapter.
  const generic = typescript ? "<T extends (...args: any[]) => any>" : "";
  const parameters = typescript ? "render: T, name: string" : "render, name";
  const cast = typescript ? " as unknown as T" : "";
  const helper = `\n/* ${marker} */
import { forwardRef as ${forwardRef} } from "react";
function ${wrap}${generic}(${parameters}) {
  const component = ${forwardRef}((props, ref) => render(ref == null ? props : { ...props, ref }));
  component.displayName = name;
  return component${cast};
}
${declarations.join("\n")}\n`;
  // Directives must stay first. Inserting at their end also keeps the
  // comments attached to the next source declaration in place.
  let start = program.hashbang?.end ?? 0;
  for (const statement of program.body) {
    if (statement.type !== "ExpressionStatement" || !statement.directive) break;
    start = statement.end;
  }
  output.appendLeft(start, helper);
  return {
    code: output.toString(),
    map: output.generateMap({ source: id, includeContent: true, hires: true }),
  };
}
