const cases = [
  {
    title: 'Local captions',
    body: 'A laptop at a talk turns speech into text and charges per minute of captions delivered to phones in the room.',
    art: (
      <>
        <rect x="14" y="20" width="92" height="58" rx="8" className="uc-frame" />
        <rect x="26" y="56" width="68" height="8" rx="4" className="uc-accent uc-blink" />
        <rect x="34" y="68" width="52" height="5" rx="2.5" className="uc-soft" />
        <path d="M38 34 q8 -10 16 0 t16 0 t16 0" className="uc-line uc-wave" />
      </>
    ),
  },
  {
    title: 'Edge compute',
    body: 'A small box on site runs a model or a conversion job and bills per task, without either side reaching a cloud.',
    art: (
      <>
        <rect x="30" y="18" width="60" height="62" rx="10" className="uc-frame" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x="42"
            y={30 + i * 16}
            width="36"
            height="8"
            rx="4"
            className="uc-accent uc-pulse"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </>
    ),
  },
  {
    title: 'Metered Wi-Fi, where permitted',
    body: 'A hotspot owner shares bandwidth by the megabyte, only where local rules allow reselling connectivity.',
    art: (
      <>
        {[38, 26, 14].map((r, i) => (
          <path
            key={r}
            d={`M${60 - r} ${66 - r * 0.2} a ${r} ${r} 0 0 1 ${r * 2} 0`}
            className="uc-line uc-pulse"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
        <circle cx="60" cy="70" r="5" className="uc-accent" />
      </>
    ),
  },
];

/** Illustrated example scenarios. They describe intended uses, not deployments. */
export function UseCases() {
  return (
    <ul className="uc-grid">
      {cases.map((c) => (
        <li key={c.title} className="uc-card">
          <svg
            viewBox="0 0 120 96"
            className="uc-art"
            role="img"
            aria-label={`Illustration: ${c.title}`}
          >
            {c.art}
          </svg>
          <span className="tag tag-planned">Example scenario</span>
          <h3>{c.title}</h3>
          <p>{c.body}</p>
        </li>
      ))}
    </ul>
  );
}
