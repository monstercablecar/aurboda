/** Synthetic RFC/PostgreSQL16 cases; no real account credentials. */
export const scramPasswordCases = [
  { name: 'ASCII', password: 'synthetic password', prepared: 'synthetic password' },
  { name: 'mapped-to-nothing soft hyphen', password: 'ab\u00adcd', prepared: 'abcd' },
  {
    name: 'joiners and variation selectors',
    password: 'ab\u034f\u1806\u180b\u200c\u200d\u2060\ufe0f\ufeffcd',
    prepared: 'abcd',
  },
  {
    name: 'non-ASCII spaces including zero-width space',
    password: 'ab\u00a0\u1680\u200b\u202f\u205f\u3000cd',
    prepared: 'ab      cd',
  },
  { name: 'NFKC ligature', password: '\ufb01sh', prepared: 'fish' },
  { name: 'NFKC combining characters', password: 'cafe\u0301', prepared: 'caf\u00e9' },
  { name: 'NFKC supplementary character assigned in Unicode3.2', password: '\u{1d400}bc', prepared: 'Abc' },
  { name: 'empty mapping falls back', password: '\u00ad', prepared: '\u00ad' },
  {
    name: 'prohibited control falls back before mapping',
    password: 'ab\u00ad\u0007cd',
    prepared: 'ab\u00ad\u0007cd',
  },
  { name: 'private-use character falls back', password: 'ab\u00ad\ue000cd', prepared: 'ab\u00ad\ue000cd' },
  {
    name: 'unassigned Unicode3.2 character falls back before modern NFKC',
    password: '\u1d2c\u00adbc',
    prepared: '\u1d2c\u00adbc',
  },
  {
    name: 'unassigned supplementary character falls back',
    password: '\u{1f600}\u00adbc',
    prepared: '\u{1f600}\u00adbc',
  },
  { name: 'valid bidi maps soft hyphen', password: '\u0627\u00ad\u0628', prepared: '\u0627\u0628' },
  { name: 'mixed bidi falls back', password: '\u0627\u00adbc', prepared: '\u0627\u00adbc' },
  {
    name: 'invalid bidi boundary falls back',
    password: '1\u0627\u00ad\u0628',
    prepared: '1\u0627\u00ad\u0628',
  },
  {
    name: 'ASCII control fast path matches PostgreSQL16',
    password: 'synthetic\tpassword',
    prepared: 'synthetic\tpassword',
  },
] as const
