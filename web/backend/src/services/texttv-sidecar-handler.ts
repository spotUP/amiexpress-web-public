/**
 * The Text-TV proxy's answer, decided without Express.
 *
 * Same contract as the board's own `/api/texttv/:page` route
 * (server/app.ts): the slim JSON verbatim, 400 for a page outside 100-999,
 * 502 when the mirror is silent. It lives apart from the route so the
 * sidecar process and the route cannot drift, and so it can be tested
 * without listening on a port.
 */
export interface TextTvAnswer {
  status: number;
  contentType: string;
  body: string;
}

const BAD_PAGE: TextTvAnswer = {
  status: 400,
  contentType: 'application/json',
  body: JSON.stringify({ success: false, message: 'page is 100-999' }),
};

const SILENT: TextTvAnswer = {
  status: 502,
  contentType: 'application/json',
  body: JSON.stringify({ success: false, message: 'Text-TV did not answer' }),
};

/** `/api/texttv/100` -> 100. Anything else -> null. */
export function pageFromPath(pathname: string): number | null {
  const m = /^\/api\/texttv\/(\d{3})\/?$/.exec(pathname);
  if (!m) return null;
  const page = Number(m[1]);
  return page >= 100 && page <= 999 ? page : null;
}

export async function answerTextTv(
  pathname: string,
  fetchPage: (page: number) => Promise<{ status: number; body: string }>,
): Promise<TextTvAnswer> {
  const page = pageFromPath(pathname);
  if (page === null) return BAD_PAGE;
  try {
    const { status, body } = await fetchPage(page);
    if (status !== 200) return SILENT;
    return { status: 200, contentType: 'application/json', body };
  } catch {
    return SILENT;
  }
}
