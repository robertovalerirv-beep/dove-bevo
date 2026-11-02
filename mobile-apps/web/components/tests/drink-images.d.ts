// The parent supplies the production module; component tests use a local image fixture.
declare module "@mobile/drink-images" {
  export function drinkImage(code: string, presentation?: "scene" | "product"): string | undefined;
}
