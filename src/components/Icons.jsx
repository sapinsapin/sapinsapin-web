export function ArrowUpRight({ className = '' }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.25 12.75 12.75 3.25M5.5 3.25h7.25v7.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function ArrowUp({ className = '' }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 12.75V3.25M3.75 7.5 8 3.25l4.25 4.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function ArrowDown({ className = '' }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3.25v9.5M3.75 8.5 8 12.75l4.25-4.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/* Used only where a link leaves this document for another page of the site —
   which on a static two-document build means the 404 page pointing home. The
   other three arrows are already spoken for: ArrowUpRight leaves the site
   entirely, ArrowUp and ArrowDown move within one page. */
export function ArrowLeft({ className = '' }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M12.75 8h-9.5M7.5 3.75 3.25 8l4.25 4.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/* A pinned marker, used for the section rows on the 404 page — they are
   positions on the homepage rather than pages of their own. */
export function Anchor({ className = '' }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 5.6v7.9M8 5.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM3 8.6a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/* The brand mark: three stacked layers widening downward — the sapin-sapin
   cake the project is named for. Layer fills come from the theme tokens via
   CSS classes so the mark follows light/dark like everything else. */
export function Mark({ className = '' }) {
  return <svg className={`brand-mark ${className}`} viewBox="0 0 48 44" fill="none" aria-hidden="true">
    <rect className="mark-layer-top" x="13" y="4" width="22" height="10" rx="5" />
    <rect className="mark-layer-mid" x="8" y="17" width="32" height="10" rx="5" />
    <rect className="mark-layer-base" x="3" y="30" width="42" height="10" rx="5" />
  </svg>
}

/* Single-colour version for use alongside the other line icons, where a
   full-colour logo would read as a brand stamp rather than an icon. */
export function MarkMono({ className = '' }) {
  return <svg className={className} viewBox="0 0 48 44" fill="currentColor" aria-hidden="true">
    <rect x="13" y="4" width="22" height="10" rx="5" opacity=".42" />
    <rect x="8" y="17" width="32" height="10" rx="5" opacity=".7" />
    <rect x="3" y="30" width="42" height="10" rx="5" />
  </svg>
}

/* Official GitHub mark; inherits the link colour. */
export function Github({ className = '' }) {
  return <svg className={className} viewBox="0 0 640 640" fill="currentColor" fillRule="evenodd" clipRule="evenodd" aria-hidden="true"><path d="M319.988 7.973C143.293 7.973 0 151.242 0 327.96c0 141.392 91.678 261.298 218.826 303.63 16.004 2.964 21.886-6.957 21.886-15.414 0-7.63-.319-32.835-.449-59.552-89.032 19.359-107.8-37.772-107.8-37.772-14.552-36.993-35.529-46.831-35.529-46.831-29.032-19.879 2.209-19.442 2.209-19.442 32.126 2.245 49.04 32.954 49.04 32.954 28.56 48.922 74.883 34.76 93.131 26.598 2.882-20.681 11.15-34.807 20.315-42.803-71.08-8.067-145.797-35.516-145.797-158.14 0-34.926 12.52-63.485 32.965-85.88-3.33-8.078-14.291-40.606 3.083-84.674 0 0 26.87-8.61 88.029 32.8 25.512-7.075 52.878-10.642 80.056-10.76 27.2.118 54.614 3.673 80.162 10.76 61.076-41.386 87.922-32.8 87.922-32.8 17.398 44.08 6.485 76.631 3.154 84.675 20.516 22.394 32.93 50.953 32.93 85.879 0 122.907-74.883 149.93-146.117 157.856 11.481 9.921 21.733 29.398 21.733 59.233 0 42.792-.366 77.28-.366 87.804 0 8.516 5.764 18.473 21.992 15.354 127.076-42.354 218.637-162.274 218.637-303.582 0-176.695-143.269-319.988-320-319.988l-.023.107z" /></svg>
}

/* Official Hugging Face mark. */
export function HuggingFace({ className = '' }) {
  return <svg className={className} viewBox="0 0 475 439" fill="none" aria-hidden="true">
    <path d="M235.793 396.126a187.281 187.281 0 00187.285-187.284A187.283 187.283 0 00235.793 21.558 187.287 187.287 0 0048.509 208.842a187.286 187.286 0 00187.284 187.284z" fill="#FFD21E" />
    <path d="M423.078 208.842A187.283 187.283 0 00235.793 21.558 187.283 187.283 0 0048.509 208.842a187.283 187.283 0 00319.714 132.43 187.284 187.284 0 0054.855-132.43zm-396.127 0a208.842 208.842 0 11417.685 0 208.842 208.842 0 01-417.685 0z" fill="#FF9D0B" />
    <path d="M296.641 157.912c6.898 2.371 9.593 16.491 16.545 12.827a26.946 26.946 0 008.24-40.841 26.952 26.952 0 00-28.632-8.767 26.942 26.942 0 00-19.055 23.099 26.943 26.943 0 003.014 15.352c3.288 6.198 13.744-3.88 19.941-1.724l-.053.054zm-126.923 0c-6.898 2.371-9.647 16.491-16.545 12.827a26.946 26.946 0 01-8.24-40.841 26.952 26.952 0 0128.632-8.767 26.944 26.944 0 0116.041 38.451c-3.288 6.198-13.797-3.88-19.941-1.724l.053.054z" fill="#3A3B45" />
    <path d="M234.446 287.205c52.979 0 70.063-47.212 70.063-71.464 0-12.612-8.461-8.624-22.043-1.941-12.557 6.198-29.426 14.768-47.966 14.768-38.75 0-70.063-37.08-70.063-12.827 0 24.252 17.031 71.464 70.063 71.464h-.054z" fill="#FF323D" />
    <path fillRule="evenodd" clipRule="evenodd" d="M193.863 274.863a46.895 46.895 0 0128.565-24.199c2.155-.646 4.365 3.072 6.682 6.899 2.156 3.665 4.42 7.384 6.683 7.384 2.426 0 4.851-3.665 7.168-7.276 2.426-3.773 4.797-7.438 7.115-6.737a46.403 46.403 0 0126.947 22.474c20.103-15.845 27.486-41.715 27.486-57.667 0-12.612-8.461-8.624-22.043-1.941l-.754.378c-12.45 6.198-29.05 14.39-47.266 14.39-18.216 0-34.762-8.192-47.266-14.39-14.012-6.953-22.797-11.318-22.797 1.563 0 16.438 7.869 43.439 29.48 59.122z" fill="#3A3B45" />
    <path d="M362.446 183.242a17.515 17.515 0 10.002-35.03 17.515 17.515 0 00-.002 35.03zm-250.61 0a17.515 17.515 0 100-35.03 17.515 17.515 0 000 35.03z" fill="#3A3B45" />
    <path d="M75.78 242.526c-8.731 0-16.492 3.557-21.935 10.079a32.173 32.173 0 00-7.168 20.264 38.275 38.275 0 00-10.456-1.617c-8.353 0-15.899 3.18-21.234 8.947a31.257 31.257 0 00-4.312 37.726 28.566 28.566 0 00-9.647 15.198 31.512 31.512 0 004.312 25.546 28.136 28.136 0 00-1.995 27.056c5.498 12.503 19.24 22.312 45.919 32.875 16.545 6.576 31.744 10.779 31.851 10.833a238.92 238.92 0 0058.907 8.623c31.583 0 54.165-9.701 67.153-28.779 20.911-30.666 17.947-58.746-9.162-85.801-14.929-14.983-24.899-37.025-26.947-41.876-4.204-14.336-15.306-30.289-33.684-30.289a30.716 30.716 0 00-24.792 13.258c-5.389-6.79-10.671-12.126-15.414-15.198a39.885 39.885 0 00-21.396-6.845z" fill="#FF9D0B" />
    <path d="M189.39 397.15c14.821-21.773 13.743-38.103-6.575-58.422-20.372-20.318-32.229-50.122-32.229-50.122s-4.419-17.246-14.498-15.629c-10.078 1.617-17.462 27.378 3.665 43.169 21.073 15.792-4.204 26.517-12.342 11.696-8.084-14.821-30.289-52.925-41.822-60.255-11.48-7.276-19.564-3.233-16.87 11.857 2.696 15.037 50.824 51.47 46.135 59.284-4.689 7.923-21.181-9.216-21.181-9.216s-51.577-46.942-62.841-34.708c-11.21 12.234 8.569 22.474 36.648 39.505 28.187 17.031 30.397 21.558 26.409 28.025-4.042 6.468-66.183-45.972-72.004-23.713-5.82 22.15 63.434 28.564 59.177 43.924-4.312 15.36-48.829-28.996-57.883-11.749-9.162 17.3 62.787 37.618 63.38 37.78 23.175 6.036 82.189 18.809 102.831-11.426z" fill="#FFD21E" />
    <path d="M398.502 242.526c8.731 0 16.545 3.557 21.935 10.079a32.173 32.173 0 017.168 20.264 38.272 38.272 0 0110.509-1.617c8.354 0 15.899 3.18 21.235 8.947a31.257 31.257 0 014.311 37.726 28.564 28.564 0 019.594 15.198 31.513 31.513 0 01-4.312 25.546 28.142 28.142 0 011.994 27.056c-5.497 12.503-19.24 22.312-45.864 32.875-16.6 6.576-31.798 10.779-31.906 10.833a238.914 238.914 0 01-58.907 8.623c-31.582 0-54.164-9.701-67.153-28.779-20.911-30.667-17.947-58.746 9.162-85.801 14.983-14.983 24.954-37.026 27.002-41.876 4.203-14.336 15.252-30.289 33.63-30.289a30.716 30.716 0 0124.792 13.258c5.389-6.791 10.671-12.126 15.467-15.198a39.888 39.888 0 0121.343-6.845z" fill="#FF9D0B" />
    <path d="M284.945 397.15c-14.821-21.773-13.797-38.103 6.576-58.422 20.318-20.318 32.175-50.122 32.175-50.122s4.419-17.246 14.551-15.629c10.025 1.617 17.408 27.378-3.664 43.169-21.127 15.792 4.203 26.517 12.287 11.696 8.139-14.821 30.343-52.925 41.823-60.255 11.479-7.276 19.617-3.233 16.869 11.857-2.695 15.037-50.769 51.47-46.08 59.284 4.635 7.923 21.127-9.216 21.127-9.216s51.631-46.942 62.841-34.708c11.21 12.234-8.515 22.474-36.649 39.505-28.186 17.031-30.342 21.558-26.408 28.025 4.042 6.468 66.183-45.972 72.003-23.713 5.821 22.15-63.38 28.564-59.122 43.924 4.311 15.36 48.775-28.996 57.883-11.749 9.108 17.3-62.788 37.618-63.38 37.78-23.229 6.036-82.244 18.809-102.832-11.426z" fill="#FFD21E" />
  </svg>
}

/* Official Facebook mark. */
export function Facebook({ className = '' }) {
  return <svg className={className} viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M512 256C512 114.6 397.4 0 256 0S0 114.6 0 256C0 376 82.7 476.8 194.2 504.5l0-170.3-52.8 0 0-78.2 52.8 0 0-33.7c0-87.1 39.4-127.5 125-127.5 16.2 0 44.2 3.2 55.7 6.4l0 70.8c-6-.6-16.5-1-29.6-1-42 0-58.2 15.9-58.2 57.2l0 27.8 83.6 0-14.4 78.2-69.3 0 0 175.9C413.8 494.8 512 386.9 512 256z" /></svg>
}

/* Official LinkedIn mark. */
export function LinkedIn({ className = '' }) {
  return <svg className={className} viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M416 32L31.9 32C14.3 32 0 46.5 0 64.3L0 447.7C0 465.5 14.3 480 31.9 480L416 480c17.6 0 32-14.5 32-32.3l0-383.4C448 46.5 433.6 32 416 32zM135.4 416l-66.4 0 0-213.8 66.5 0 0 213.8-.1 0zM102.2 96a38.5 38.5 0 1 1 0 77 38.5 38.5 0 1 1 0-77zM384.3 416l-66.4 0 0-104c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9l0 105.8-66.4 0 0-213.8 63.7 0 0 29.2 .9 0c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9l0 117.2z" /></svg>
}

/* Official Discord mark. */
export function Discord({ className = '' }) {
  return <svg className={className} viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M492.5 69.8c-.2-.3-.4-.6-.8-.7-38.1-17.5-78.4-30-119.7-37.1-.4-.1-.8 0-1.1 .1s-.6 .4-.8 .8c-5.5 9.9-10.5 20.2-14.9 30.6-44.6-6.8-89.9-6.8-134.4 0-4.5-10.5-9.5-20.7-15.1-30.6-.2-.3-.5-.6-.8-.8s-.7-.2-1.1-.2c-41.3 7.1-81.6 19.6-119.7 37.1-.3 .1-.6 .4-.8 .7-76.2 113.8-97.1 224.9-86.9 334.5 0 .3 .1 .5 .2 .8s.3 .4 .5 .6c44.4 32.9 94 58 146.8 74.2 .4 .1 .8 .1 1.1 0s.7-.4 .9-.7c11.3-15.4 21.4-31.8 30-48.8 .1-.2 .2-.5 .2-.8s0-.5-.1-.8-.2-.5-.4-.6-.4-.3-.7-.4c-15.8-6.1-31.2-13.4-45.9-21.9-.3-.2-.5-.4-.7-.6s-.3-.6-.3-.9 0-.6 .2-.9 .3-.5 .6-.7c3.1-2.3 6.2-4.7 9.1-7.1 .3-.2 .6-.4 .9-.4s.7 0 1 .1c96.2 43.9 200.4 43.9 295.5 0 .3-.1 .7-.2 1-.2s.7 .2 .9 .4c2.9 2.4 6 4.9 9.1 7.2 .2 .2 .4 .4 .6 .7s.2 .6 .2 .9-.1 .6-.3 .9-.4 .5-.6 .6c-14.7 8.6-30 15.9-45.9 21.8-.2 .1-.5 .2-.7 .4s-.3 .4-.4 .7-.1 .5-.1 .8 .1 .5 .2 .8c8.8 17 18.8 33.3 30 48.8 .2 .3 .6 .6 .9 .7s.8 .1 1.1 0c52.9-16.2 102.6-41.3 147.1-74.2 .2-.2 .4-.4 .5-.6s.2-.5 .2-.8c12.3-126.8-20.5-236.9-86.9-334.5zm-302 267.7c-29 0-52.8-26.6-52.8-59.2s23.4-59.2 52.8-59.2c29.7 0 53.3 26.8 52.8 59.2 0 32.7-23.4 59.2-52.8 59.2zm195.4 0c-29 0-52.8-26.6-52.8-59.2s23.4-59.2 52.8-59.2c29.7 0 53.3 26.8 52.8 59.2 0 32.7-23.2 59.2-52.8 59.2z" /></svg>
}

export function Code({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8.4 7.5-4.5 4.5 4.5 4.5M15.6 7.5l4.5 4.5-4.5 4.5M13.7 5.4l-3.4 13.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function Dataset({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6.5c0 1.66-3.58 3-8 3s-8-1.34-8-3 3.58-3 8-3 8 1.34 8 3ZM4 6.5v5.5c0 1.66 3.58 3 8 3s8-1.34 8-3V6.5M4 12v5.5c0 1.66 3.58 3 8 3s8-1.34 8-3V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/* Solid geometry rather than hairlines — reads cleanly at nav size and holds
   up against the crescent when the two crossfade. */
export function Sun({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4.75" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M12 1.9v2.4M12 19.7v2.4M22.1 12h-2.4M4.3 12H1.9M19.14 4.86l-1.7 1.7M6.56 17.44l-1.7 1.7M19.14 19.14l-1.7-1.7M6.56 6.56l-1.7-1.7" />
    </g>
  </svg>
}

export function Moon({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path fill="currentColor" d="M21.35 14.32a1 1 0 0 0-1.2-1.32 8.1 8.1 0 0 1-9.98-9.98 1 1 0 0 0-1.32-1.2 10.1 10.1 0 1 0 12.5 12.5Z" />
  </svg>
}

export function CopyIcon({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
}

export function CheckIcon({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
}
