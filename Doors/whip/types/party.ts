export interface Party {
  id: string;
  name: string;
  date: string;
  location: string;
  url?: string;
  categories: string[];
  source?: 'scraped' | 'manual';
}
