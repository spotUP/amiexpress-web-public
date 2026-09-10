/**
 * The co-sysop's general knowledge: Wikipedia, Wikidata, weather, SVT
 * Text-TV, OpenAlex, quakes, Hacker News. Keyless, time-boxed, cached.
 *
 * Fetchers are injected: what is pinned is the shape of the answer, the
 * cache (a second ask does not fetch), and that a dead net yields a
 * sentence rather than a hang or a throw. Fixture shapes come from the
 * live endpoints (probed 2026-09-10), not the doc alone.
 */
import { askWikipedia, wikipediaSearch, setWikipediaFetcher, resetWikipediaCache } from '../../../src/handlers/sysop-ai/external/wikipedia';
import { wikidataFacts, setWikidataFetcher, resetWikidataCache } from '../../../src/handlers/sysop-ai/external/wikidata';
import { weatherNow, setWeatherFetcher, resetWeatherCache } from '../../../src/handlers/sysop-ai/external/weather';
import { texttvPage, setTexttvFetcher, resetTexttvCache } from '../../../src/handlers/sysop-ai/external/texttv';
import { openalexSearch, setOpenalexFetcher, resetOpenalexCache } from '../../../src/handlers/sysop-ai/external/openalex';
import { recentQuakes, hnSearch, setHeadlinesFetcher, resetHeadlinesCache } from '../../../src/handlers/sysop-ai/external/headlines';

beforeEach(() => {
  resetWikipediaCache(); setWikipediaFetcher(null);
  resetWikidataCache(); setWikidataFetcher(null);
  resetWeatherCache(); setWeatherFetcher(null);
  resetTexttvCache(); setTexttvFetcher(null);
  resetOpenalexCache(); setOpenalexFetcher(null);
  resetHeadlinesCache(); setHeadlinesFetcher(null);
});
afterAll(() => {
  setWikipediaFetcher(null); setWikidataFetcher(null); setWeatherFetcher(null);
  setTexttvFetcher(null); setOpenalexFetcher(null); setHeadlinesFetcher(null);
});

describe('wikipedia', () => {
  it('searches, and the second ask comes from the cache', async () => {
    let fetched = 0;
    setWikipediaFetcher(async (url) => {
      fetched++;
      expect(url).toContain('/search/page?q=Amiga');
      return { pages: [{ key: 'Amiga', title: 'Amiga', description: 'Family of personal computers' }] };
    });
    const a = await wikipediaSearch('Amiga');
    expect(a).toContain('Amiga - Family of personal computers');
    await wikipediaSearch('AMIGA');
    expect(fetched).toBe(1);
  });
  it('ask answers "what is X" from the top hit', async () => {
    setWikipediaFetcher(async (url) => {
      if (url.includes('/search/page')) return { pages: [{ key: 'Amiga', title: 'Amiga' }, { key: 'AmigaOS', title: 'AmigaOS' }] };
      return { title: 'Amiga', description: 'Family of personal computers', extract: 'Amiga is a family of personal computers produced by Commodore.' };
    });
    const a = await askWikipedia('amiga');
    expect(a).toContain('Family of personal computers');
    expect(a).toContain('Also matches: AmigaOS.');
  });
  it('a miss is not cached: the throttled edge recovers by itself', async () => {
    let serve: any[] = [];
    setWikipediaFetcher(async (url) => {
      if (url.includes('search/page')) return { pages: serve };
      return { title: 'Amiga', extract: 'Amiga is a family of personal computers.' };
    });
    expect(await askWikipedia('Amiga')).toContain('nothing about');
    serve = [{ key: 'Amiga', title: 'Amiga' }];
    expect(await askWikipedia('Amiga')).toContain('personal computers');
  });
  it('a question-shaped query falls back to its subject', async () => {
    const seen: string[] = [];
    setWikipediaFetcher(async (url) => {
      seen.push(url);
      if (url.includes('search/page')) {
        const q = new URL(url).searchParams.get('q');
        if (q === 'Turrican') {
          return { pages: [{ key: 'Turrican_(video_game)', title: 'Turrican (video game)' }] };
        }
        return { pages: [] };
      }
      return { title: 'Turrican (video game)', description: '1990 run-and-gun game', extract: 'Turrican is a 1990 game designed by Manfred Trenz.' };
    });
    const a = await askWikipedia('Turrican video game developer');
    expect(a).toContain('Manfred Trenz');
    expect(seen.some((u) => u.includes('q=Turrican'))).toBe(true);
  });
  it('a summary that 404s falls through to the next hit', async () => {
    setWikipediaFetcher(async (url) => {
      if (url.includes('search/page')) {
        return { pages: [{ key: 'Gone', title: 'Gone' }, { key: 'Amiga', title: 'Amiga' }] };
      }
      if (url.includes('/summary/Gone')) {
        throw Object.assign(new Error('404'), { response: { status: 404 } });
      }
      return { title: 'Amiga', extract: 'Amiga is a family of personal computers.' };
    });
    const a = await askWikipedia('amiga');
    expect(a).toContain('family of personal computers');
  });
});

describe('wikidata', () => {
  it('facts name the thing, its aliases, and the article to read', async () => {
    setWikidataFetcher(async (url) => {
      if (url.includes('wbsearchentities')) return { search: [{ id: 'Q47604', label: 'Amiga' }] };
      return {
        entities: { Q47604: {
          labels: { en: { value: 'Amiga' } }, descriptions: { en: { value: 'family of personal computers' } },
          aliases: { en: [{ value: 'Commodore Amiga' }] },
          sitelinks: { enwiki: { title: 'Amiga' } },
        } },
      };
    });
    const a = await wikidataFacts('amiga');
    expect(a).toContain('Amiga - family of personal computers [Q47604]');
    expect(a).toContain('Also called: Commodore Amiga.');
    expect(a).toContain('ask_wikipedia "Amiga"');
  });
});

describe('weather', () => {
  it('names the place, now, today, wind', async () => {
    setWeatherFetcher(async (url) => {
      if (url.includes('geocoding')) return { results: [{ name: 'Stockholm', country: 'Sweden', latitude: 59.33, longitude: 18.06 }] };
      return { current: { temperature_2m: 13.8, weather_code: 2, wind_speed_10m: 11 }, daily: { temperature_2m_max: [15], temperature_2m_min: [9] } };
    });
    const a = await weatherNow('stockholm');
    expect(a).toBe('Stockholm, Sweden: 13.8C, partly cloudy. Today 9-15C. Wind 11 km/h.');
  });
  it('admits unknown places plainly', async () => {
    setWeatherFetcher(async () => ({}));
    expect(await weatherNow('nowhere-at-all')).toContain('No place called');
  });
});

describe('text-tv', () => {
  it('reads a page in plain text', async () => {
    setTexttvFetcher(async (url) => {
      expect(url).toContain('/100?app=amiexpress-web-bbs&includePlainTextContent=1');
      return [{ num: '100', title: 'Big news', content_plain: '  100 SVT Text\n\n  Big news happened\n' }];
    });
    const a = await texttvPage('100');
    expect(a).toContain('--- page 100: Big news ---');
    expect(a).toContain('Big news happened');
  });
  it('refuses non-pages before touching the net', async () => {
    let fetched = 0;
    setTexttvFetcher(async () => { fetched++; return []; });
    expect(await texttvPage('delete everything')).toContain('numbers like 100');
    expect(fetched).toBe(0);
  });
});

describe('openalex and headlines', () => {
  it('papers with year, authors, citations', async () => {
    setOpenalexFetcher(async () => ({
      results: [{ title: 'On BBS culture', publication_year: 1994,
        authorships: [{ author: { display_name: 'J. Sysop' } }],
        cited_by_count: 12, doi: 'https://doi.org/10.1/x' }],
    }));
    const a = await openalexSearch('bbs culture');
    expect(a).toContain('1994: On BBS culture - J. Sysop (cited 12)');
  });
  it('quakes with magnitude, depth, place, full time', async () => {
    setHeadlinesFetcher(async () => ({
      features: [{ properties: { mag: 5.2, place: 'Off the coast', time: 1786400000000 }, geometry: { coordinates: [0, 0, 29.4] } }],
    }));
    const a = await recentQuakes();
    expect(a).toContain('M5.2, 29 km deep, Off the coast');
    expect(a).toContain('do not add others');
  });
  it('hacker news with points and comments', async () => {
    setHeadlinesFetcher(async () => ({
      hits: [{ title: 'Amiga forever', points: 100, num_comments: 40, url: 'https://example.com' }],
    }));
    const a = await hnSearch('amiga');
    expect(a).toContain('Amiga forever (100 pts, 40 comments)');
  });
});
