/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set for the GitHub Pages build, which has no song analyzer behind it. */
  readonly VITE_DEMO_ONLY?: string;
}
