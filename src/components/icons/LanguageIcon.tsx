// ---------------------------------------------------------------------------
// icons/LanguageIcon.tsx — Iconify-powered language icon for architecture nodes
// ---------------------------------------------------------------------------

import { memo, type FC } from 'react';
import { Icon } from '@iconify/react';

// ---- Language definitions --------------------------------------------------

interface LanguageDef {
  icon: string;       // Iconify icon name
  color: string;      // Accent / background tint colour
  bgColor?: string;   // Optional explicit background (falls back to color)
}

const DEFAULT_LANG: LanguageDef = { icon: 'mdi:file-code-outline', color: '#6B7280' };

const LANGUAGES: Record<string, LanguageDef> = {
  // TypeScript / JavaScript
  ts:     { icon: 'devicon:typescript',            color: '#3178C6' },
  tsx:    { icon: 'devicon:typescript',            color: '#3178C6' },
  mts:    { icon: 'devicon:typescript',            color: '#3178C6' },
  cts:    { icon: 'devicon:typescript',            color: '#3178C6' },
  js:     { icon: 'devicon:javascript',            color: '#F7DF1E' },
  jsx:    { icon: 'devicon:react',                 color: '#61DAFB' },
  mjs:    { icon: 'devicon:javascript',            color: '#F7DF1E' },
  cjs:    { icon: 'devicon:javascript',            color: '#F7DF1E' },

  // Go
  go:     { icon: 'devicon:go',                    color: '#00ADD8' },

  // Python
  py:     { icon: 'devicon:python',                color: '#3776AB' },
  pyw:    { icon: 'devicon:python',                color: '#3776AB' },
  pyi:    { icon: 'devicon:python',                color: '#3776AB' },

  // Rust
  rs:     { icon: 'devicon:rust',                  color: '#DEA584' },

  // Java / JVM
  java:   { icon: 'devicon:java',                  color: '#ED8B00' },
  kt:     { icon: 'devicon:kotlin',                color: '#7F52FF' },
  kts:    { icon: 'devicon:kotlin',                color: '#7F52FF' },
  scala:  { icon: 'devicon:scala',                 color: '#DC322F' },
  groovy: { icon: 'devicon:groovy',                color: '#4298B8' },
  clj:    { icon: 'devicon:clojure',               color: '#5881D8' },

  // C family
  c:      { icon: 'devicon:c',                     color: '#A8B9CC' },
  h:      { icon: 'devicon:c',                     color: '#A8B9CC' },
  cpp:    { icon: 'devicon:cplusplus',             color: '#00599C' },
  cc:     { icon: 'devicon:cplusplus',             color: '#00599C' },
  cxx:    { icon: 'devicon:cplusplus',             color: '#00599C' },
  hpp:    { icon: 'devicon:cplusplus',             color: '#00599C' },
  hh:     { icon: 'devicon:cplusplus',             color: '#00599C' },
  cs:     { icon: 'devicon:csharp',                color: '#239120' },
  m:      { icon: 'devicon:objectivec',            color: '#438EFF' },

  // Web
  html:   { icon: 'devicon:html5',                 color: '#E34F26' },
  htm:    { icon: 'devicon:html5',                 color: '#E34F26' },
  css:    { icon: 'devicon:css3',                  color: '#1572B6' },
  scss:   { icon: 'devicon:sass',                  color: '#CC6699' },
  sass:   { icon: 'devicon:sass',                  color: '#CC6699' },
  less:   { icon: 'devicon:less',                  color: '#1D365D' },
  vue:    { icon: 'devicon:vuejs',                 color: '#4FC08D' },
  svelte: { icon: 'devicon:svelte',                color: '#FF3E00' },
  astro:  { icon: 'devicon:astro',                 color: '#FF5D01' },

  // Scripting
  rb:     { icon: 'devicon:ruby',                  color: '#CC342D' },
  php:    { icon: 'devicon:php',                   color: '#777BB4' },
  lua:    { icon: 'devicon:lua',                   color: '#000080' },
  pl:     { icon: 'devicon:perl',                  color: '#39457E' },
  r:      { icon: 'devicon:r',                     color: '#276DC3' },

  // Apple / Mobile
  swift:  { icon: 'devicon:swift',                 color: '#F05138' },
  dart:   { icon: 'devicon:dart',                  color: '#0175C2' },

  // Functional
  hs:     { icon: 'devicon:haskell',               color: '#5e5086' },
  ex:     { icon: 'devicon:elixir',                color: '#6E4A7E' },
  exs:    { icon: 'devicon:elixir',                color: '#6E4A7E' },
  erl:    { icon: 'devicon:erlang',                color: '#A90533' },
  ml:     { icon: 'devicon:ocaml',                 color: '#EC6813' },
  fs:     { icon: 'devicon:fsharp',                color: '#378BBA' },
  fsx:    { icon: 'devicon:fsharp',                color: '#378BBA' },

  // Systems
  zig:    { icon: 'devicon:zig',                   color: '#F7A41D' },
  nim:    { icon: 'devicon:nimble',                color: '#FFE953' },
  v:      { icon: 'mdi:language-v',                color: '#5D87BF' },

  // Data / Config
  json:   { icon: 'mdi:code-json',                color: '#292929' },
  jsonc:  { icon: 'mdi:code-json',                color: '#292929' },
  yaml:   { icon: 'mdi:file-cog-outline',         color: '#CB171E' },
  yml:    { icon: 'mdi:file-cog-outline',         color: '#CB171E' },
  toml:   { icon: 'mdi:file-cog-outline',         color: '#9C4121' },
  xml:    { icon: 'mdi:xml',                       color: '#0060AC' },
  graphql:{ icon: 'devicon:graphql',               color: '#E535AB' },
  gql:    { icon: 'devicon:graphql',               color: '#E535AB' },
  proto:  { icon: 'mdi:google',                    color: '#4285F4' },

  // Shell
  sh:     { icon: 'devicon:bash',                  color: '#4EAA25' },
  bash:   { icon: 'devicon:bash',                  color: '#4EAA25' },
  zsh:    { icon: 'devicon:bash',                  color: '#4EAA25' },
  fish:   { icon: 'devicon:bash',                  color: '#4EAA25' },
  ps1:    { icon: 'devicon:powershell',            color: '#012456' },
  bat:    { icon: 'mdi:console',                   color: '#C1F12E' },
  cmd:    { icon: 'mdi:console',                   color: '#C1F12E' },

  // SQL
  sql:    { icon: 'mdi:database',                  color: '#e38c00' },

  // Docs
  md:     { icon: 'devicon:markdown',              color: '#083FA1' },
  mdx:    { icon: 'devicon:markdown',              color: '#083FA1' },
  txt:    { icon: 'mdi:file-document-outline',     color: '#6B7280' },

  // Docker / Infra
  dockerfile: { icon: 'devicon:docker',            color: '#2496ED' },
  tf:     { icon: 'devicon:terraform',             color: '#7B42BC' },
  hcl:    { icon: 'devicon:terraform',             color: '#7B42BC' },

  // WASM
  wasm:   { icon: 'mdi:hexagon-outline',           color: '#654FF0' },
  wat:    { icon: 'mdi:hexagon-outline',           color: '#654FF0' },
};

// ---- Annotation → Iconify icon mapping -------------------------------------

const ANNOTATION_ICONS: Record<string, { icon: string; color: string }> = {
  db:       { icon: 'mdi:database',                  color: '#3B82F6' },
  store:    { icon: 'mdi:database',                  color: '#3B82F6' },
  external: { icon: 'mdi:package-variant-closed',    color: '#8B5CF6' },
  ext:      { icon: 'mdi:package-variant-closed',    color: '#8B5CF6' },
  leaf:     { icon: 'mdi:leaf',                       color: '#10B981' },
  cycle:    { icon: 'mdi:refresh',                    color: '#F59E0B' },
  error:    { icon: 'mdi:alert-circle',               color: '#EF4444' },
  api:      { icon: 'mdi:api',                        color: '#F97316' },
  route:    { icon: 'mdi:routes',                     color: '#06B6D4' },
  handler:  { icon: 'mdi:function-variant',           color: '#8B5CF6' },
  config:   { icon: 'mdi:cog',                        color: '#6B7280' },
  test:     { icon: 'mdi:test-tube',                  color: '#22C55E' },
  auth:     { icon: 'mdi:shield-lock-outline',        color: '#EAB308' },
  cache:    { icon: 'mdi:cached',                     color: '#14B8A6' },
  queue:    { icon: 'mdi:tray-full',                  color: '#A855F7' },
  event:    { icon: 'mdi:lightning-bolt',             color: '#F59E0B' },
  worker:   { icon: 'mdi:cogs',                       color: '#64748B' },
  middleware:{ icon: 'mdi:layers-triple',              color: '#6366F1' },
};

// ---- Public helpers --------------------------------------------------------

export function getLanguageFromPath(filePath: string): LanguageDef {
  if (!filePath) return DEFAULT_LANG;

  const base = filePath.split('/').pop()?.split('\\').pop() ?? '';
  if (base.toLowerCase() === 'dockerfile') return LANGUAGES['dockerfile'];
  if (base.toLowerCase() === 'makefile') return { icon: 'mdi:wrench', color: '#6B4C3B' };

  const ext = base.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGES[ext] ?? DEFAULT_LANG;
}

/**
 * Pick the best Iconify icon for a node based on annotations, then file language.
 */
export function resolveNodeIcon(
  filePath?: string,
  annotations?: string[],
  isExternal?: boolean,
): { icon: string; color: string } {
  // 1) If external with no file, show package
  if (isExternal && !filePath) {
    return { icon: 'mdi:package-variant-closed', color: '#8B5CF6' };
  }

  // 2) Check annotations for a semantic icon override
  if (annotations) {
    for (const a of annotations) {
      const mapped = ANNOTATION_ICONS[a];
      if (mapped) return mapped;
    }
  }

  // 3) Fall back to language icon
  const lang = getLanguageFromPath(filePath ?? '');
  return { icon: lang.icon, color: lang.color };
}

// ---- Component -------------------------------------------------------------

interface LanguageIconProps {
  filePath?: string;
  isExternal?: boolean;
  annotations?: string[];
  /** Icon dimension in px (default 40) */
  size?: number;
}

const LanguageIcon: FC<LanguageIconProps> = ({ filePath, isExternal, annotations, size = 40 }) => {
  const { icon, color } = resolveNodeIcon(filePath, annotations, isExternal);

  return (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{
        width: size,
        height: size,
        background: `${color}18`,
        boxShadow: `0 2px 12px ${color}25`,
      }}
    >
      <Icon icon={icon} width={size * 0.6} height={size * 0.6} style={{ color }} />
    </div>
  );
};

export default memo(LanguageIcon);
