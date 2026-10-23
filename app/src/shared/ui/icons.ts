/** The header's 20 px line glyphs, as the boards draw them (2 px round strokes on a 20-unit grid). */
export function icon(name: "menu" | "back" | "forward" | "close" | "calendar"): string {
  const paths: Record<typeof name, string> = {
    menu: '<path d="M3 5h14M3 10h14M3 15h14"/>',
    back: '<path d="M12 4l-6 6 6 6"/>',
    forward: '<path d="M8 4l6 6-6 6"/>',
    close: '<path d="M5 5l10 10M15 5 5 15"/>',
    calendar: '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/>',
  };

  return `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
