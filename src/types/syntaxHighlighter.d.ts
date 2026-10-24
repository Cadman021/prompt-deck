// Ambient types for the parts of `react-syntax-highlighter` and `refractor`
// that @types/react-syntax-highlighter does not declare.
//
// The app binds the renderer to `refractor/core` instead of the packaged
// `prism` / `prism-async-light` entry points: those import `refractor/all`,
// whose ~450 grammars become one bundle chunk each (~3.6 MB of installer).
// `highlight()` is the factory every Prism build of the library goes through.

declare module 'react-syntax-highlighter/dist/esm/highlight' {
  import type * as React from 'react';

  type Highlighter = React.ComponentType<Record<string, unknown>>;

  /**
   * @param astGenerator a refractor/prism instance
   * @param defaultStyle   inline styles used when `useInlineStyles` is on
   */
  const highlight: (
    astGenerator: unknown,
    defaultStyle: Record<string, React.CSSProperties>
  ) => Highlighter;

  export default highlight;
}

declare module 'refractor/core' {
  /** Minimal refractor surface the app needs: register + highlight/hast. */
  export const refractor: {
    register: (grammar: unknown) => void;
    registered: (name: string) => boolean;
    highlight: (value: string, language: string) => unknown;
    listLanguages: () => string[];
  };
}
