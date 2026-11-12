/** Tailwind CSS default breakpoints (min-width, px), the de-facto industry reference. */
export const BREAKPOINTS: readonly { readonly name: string; readonly min: number }[] = [
  { name: '2xl', min: 1536 },
  { name: 'xl', min: 1280 },
  { name: 'lg', min: 1024 },
  { name: 'md', min: 768 },
  { name: 'sm', min: 640 },
];

/** Name of the active breakpoint for a viewport width, or `xs` below the smallest one. */
export function breakpointFor(width: number): string {
  return BREAKPOINTS.find((breakpoint) => width >= breakpoint.min)?.name ?? 'xs';
}
