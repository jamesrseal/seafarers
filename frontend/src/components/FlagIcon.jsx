import { flagCode } from '../utils/flags';

// Every flag-icons SVG as a URL. no-inline keeps each flag a separate file, so
// the bundle holds only the URLs and a page downloads just the flags it shows.
const FLAG_SVGS = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});

// A ship's flag, drawn beside the flag name. alt is empty because the name is
// always shown with it. Renders nothing for a blank or unmapped name.
export default function FlagIcon({ flag, height = 12, className = '' }) {
  const code = flagCode(flag);
  const src = code && FLAG_SVGS[`/node_modules/flag-icons/flags/4x3/${code}.svg`];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      style={{ height, width: (height * 4) / 3 }}
      className={`inline-block shrink-0 align-middle rounded-sm ring-1 ring-black/10 ${className}`}
    />
  );
}
