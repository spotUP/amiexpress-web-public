/** One article as the Magazine route lists it. The body comes separately, for the preview. */
export interface MagazineStorySummary {
  id: string;
  headline: string;
  desk: string;
  deskLabel: string;
  /** The site, never an address. */
  source: string;
  date: string;
  bodyLength: number;
  origin: 'feed' | 'authored';
}

export interface MagazineStoryBody extends MagazineStorySummary {
  body: string;
  summary: string;
}

export interface MagazineFrontData {
  /** Every article, newest first. */
  stories: MagazineStorySummary[];
  /** Story ids on the front page; the first is the lead. */
  front: string[];
}
