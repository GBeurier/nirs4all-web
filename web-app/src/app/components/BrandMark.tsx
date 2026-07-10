/** The nirs4all family logo mark, shared visually with nirs4all.org and the
 *  rest of the ecosystem. Renders the official brand icon from the static
 *  `public/brand/` assets; `import.meta.env.BASE_URL` keeps the path correct
 *  under any GitHub Pages deploy path. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/icon.svg`}
      alt="nirs4all"
      className={className}
      draggable={false}
    />
  )
}
