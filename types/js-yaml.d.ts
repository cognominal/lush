declare module "js-yaml" {
  export function load(str: string): unknown;
  export function dump(obj: unknown, options?: { indent?: number; noRefs?: boolean; lineWidth?: number }): string;
}
