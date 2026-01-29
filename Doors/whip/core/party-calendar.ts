import * as xml2js from 'xml2js';
import type { Party } from '../types/party';
import type { DataManager } from './data-manager';

const PARTY_FEED_URL = 'https://www.demoparty.net/demoparties.xml';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getDefaultParties(): Party[] {
  return [
    {
      id: 'revision-2026',
      name: 'Revision 2026',
      date: '2026-04-10',
      location: 'Saarbrucken, Germany',
      url: 'https://revision-party.net',
      categories: ['demo', '64k', '4k', 'oldskool', 'music', 'graphics', 'wild'],
      source: 'manual'
    },
    {
      id: 'assembly-2026',
      name: 'Assembly 2026',
      date: '2026-07-31',
      location: 'Helsinki, Finland',
      url: 'https://www.assembly.org',
      categories: ['demo', '64k', '4k', 'music', 'graphics', 'game'],
      source: 'manual'
    },
    {
      id: 'evoke-2026',
      name: 'Evoke 2026',
      date: '2026-08-14',
      location: 'Cologne, Germany',
      url: 'https://www.evoke.eu',
      categories: ['demo', 'intro', 'music', 'graphics'],
      source: 'manual'
    }
  ];
}

export class PartyCalendar {
  private lastFetchTime: number = 0;

  constructor(private dataManager: DataManager) {}

  async fetchUpcomingParties(): Promise<Party[]> {
    try {
      console.log('[PartyCalendar] Fetching parties from:', PARTY_FEED_URL);
      const response = await fetch(PARTY_FEED_URL, {
        headers: {
          'User-Agent': 'AmiExpress-Whip-Door/1.0'
        }
      });

      if (!response.ok) {
        console.error('[PartyCalendar] Failed to fetch demoparty.net feed:', response.status, response.statusText);
        return [];
      }

      const xmlText = await response.text();
      console.log('[PartyCalendar] Received XML response, length:', xmlText.length);

      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlText);

      const parties = this.mapXmlToParties(result);
      console.log('[PartyCalendar] Parsed', parties.length, 'upcoming parties from feed');
      return parties;
    } catch (error) {
      console.error('[PartyCalendar] Error fetching parties from demoparty.net:', error);
      return [];
    }
  }

  private mapXmlToParties(xmlData: any): Party[] {
    const parties: Party[] = [];

    try {
      // demoparty.net XML is RSS format: <rss><channel><item>...</item></channel></rss>
      const items = xmlData?.rss?.channel?.[0]?.item || [];
      console.log('[PartyCalendar] Found', items.length, 'items in RSS feed');

      for (const item of items) {
        // Extract data from RSS item with demopartynet namespace
        const name = item['demopartynet:title']?.[0] || item.title?.[0] || '';
        const startDateStr = item['demopartynet:startDate']?.[0] || '';
        const url = item['demopartynet:url']?.[0] || item.link?.[0] || '';
        const country = item['demopartynet:country']?.[0] || '';

        // Parse location from description HTML if available
        let location = country ? country.toUpperCase() : 'Unknown';
        const description = item.description?.[0] || '';
        const locationMatch = description.match(/<dt>Location<\/dt>\s*<dd>([^<]+)/);
        if (locationMatch) {
          location = locationMatch[1].trim();
        }

        // Skip if missing required fields
        if (!name || !startDateStr) {
          console.log('[PartyCalendar] Skipping item, missing name or date:', name);
          continue;
        }

        // Parse date and filter to only upcoming parties
        const partyDate = new Date(startDateStr);
        const now = new Date();
        if (partyDate < now) {
          continue;
        }

        // Generate ID from name
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Format date as YYYY-MM-DD
        const formattedDate = partyDate.toISOString().split('T')[0];

        parties.push({
          id,
          name,
          date: formattedDate,
          location: location || 'Unknown',
          url: url || undefined,
          categories: [], // demoparty.net doesn't provide categories in the feed
          source: 'scraped'
        });
      }
    } catch (error) {
      console.error('[PartyCalendar] Error parsing demoparty.net XML:', error);
    }

    return parties;
  }

  async refreshParties(): Promise<void> {
    const now = Date.now();

    // Check cache
    if (now - this.lastFetchTime < CACHE_DURATION_MS) {
      console.log('[PartyCalendar] Using cached party data (age:', Math.floor((now - this.lastFetchTime) / 1000 / 60), 'minutes)');
      return; // Use cached data
    }

    console.log('[PartyCalendar] Refreshing party data from demoparty.net...');
    const scrapedParties = await this.fetchUpcomingParties();
    const localParties = await this.dataManager.loadParties();

    console.log('[PartyCalendar] Local parties:', localParties.length, 'Scraped parties:', scrapedParties.length);

    // Merge: keep user-added parties, update/add scraped ones
    const merged = this.mergeParties(localParties, scrapedParties);
    console.log('[PartyCalendar] Merged party list:', merged.length, 'parties');

    await this.dataManager.saveParties(merged);

    this.lastFetchTime = now;
  }

  private mergeParties(local: Party[], scraped: Party[]): Party[] {
    const merged = [...local];

    for (const scrapedParty of scraped) {
      const existingIndex = merged.findIndex(p => p.id === scrapedParty.id);

      if (existingIndex >= 0) {
        // Update existing scraped party
        if (merged[existingIndex].source === 'scraped') {
          merged[existingIndex] = scrapedParty;
        }
        // Keep manual entries unchanged
      } else {
        // Add new scraped party
        merged.push(scrapedParty);
      }
    }

    // Sort by date
    merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return merged;
  }

  getDaysUntilParty(partyDate: string): number {
    const now = new Date();
    const party = new Date(partyDate);
    const diff = party.getTime() - now.getTime();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }

  getPartyCountdownColor(days: number): string {
    if (days < 0) return 'gray';
    if (days < 7) return 'red';
    if (days < 30) return 'yellow';
    return 'cyan';
  }
}
