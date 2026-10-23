// The strings a face shows, for the smoke tools' assertions.
import type { RendererNode } from "@parity/product-sdk-renderer";

export function textsIn(face: RendererNode): string[] {
  const node = face as unknown as {
    tag: string;
    value?: { text?: string; props?: { text?: string }; children?: RendererNode[] };
  };
  const own =
    node.tag === "String"
      ? [String(node.value?.text)]
      : node.tag === "Button"
        ? [String(node.value?.props?.text)]
        : [];
  return own.concat((node.value?.children ?? []).flatMap(textsIn));
}

export function expectText(
  face: RendererNode,
  text: string,
  label: string,
  fail: (message: string) => never,
): void {
  if (!textsIn(face).includes(text)) {
    fail(`${label}: "${text}" missing from ${JSON.stringify(textsIn(face))}`);
  }
}

/** Every archive image path a face draws, in tree order. */
export function imagePathsIn(face: RendererNode): string[] {
  const node = face as unknown as {
    tag: string;
    value?: { props?: { source?: { tag: string; value: string } }; children?: RendererNode[] };
  };
  const own =
    node.tag === "Image" && node.value?.props?.source?.tag === "Archive"
      ? [node.value.props.source.value]
      : [];
  return own.concat((node.value?.children ?? []).flatMap(imagePathsIn));
}

/** The theme colour of the state strip: the 8dp-wide Box's background. */
export function stripTokenIn(face: RendererNode): string | undefined {
  const node = face as unknown as {
    tag: string;
    value?: { modifiers?: { tag: string; value: unknown }[]; children?: RendererNode[] };
  };
  const modifiers = node.value?.modifiers ?? [];
  if (node.tag === "Box" && modifiers.some((m) => m.tag === "Width" && m.value === 8)) {
    const bg = modifiers.find((m) => m.tag === "Background") as { value: { color: string } } | undefined;
    return bg?.value.color;
  }
  for (const child of node.value?.children ?? []) {
    const found = stripTokenIn(child);
    if (found) return found;
  }
  return undefined;
}
