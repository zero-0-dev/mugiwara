import axios from 'axios';

const ANILIST_API_URL = 'https://graphql.anilist.co';

interface AniListManga {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  description: string | null;
  coverImage: {
    large: string;
    medium: string;
  } | null;
  bannerImage: string | null;
  author: string | null;
  artist: string | null;
  status: string;
  genres: string[];
  tags: { name: string }[];
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  chapters: number | null;
  volumes: number | null;
  synonyms: string[];
}

const SEARCH_MANGA_QUERY = `
  query SearchManga($search: String) {
    Page(perPage: 5) {
      media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
        id
        title {
          romaji
          english
          native
        }
        description
        coverImage {
          large
          medium
        }
        bannerImage
        staff(sort: ROLE) {
          edges {
            node {
              name {
                full
              }
            }
            role
          }
        }
        status
        genres
        tags {
          name
        }
        startDate {
          year
          month
          day
        }
        chapters
        volumes
        synonyms
      }
    }
  }
`;

const GET_MANGA_QUERY = `
  query GetManga($id: Int!) {
    Media(id: $id, type: MANGA) {
      id
      title {
        romaji
        english
        native
      }
      description
      coverImage {
        large
        medium
      }
      bannerImage
      staff(sort: ROLE) {
        edges {
          node {
            name {
              full
            }
          }
          role
        }
      }
      status
      genres
      tags {
        name
      }
      startDate {
        year
        month
        day
      }
      chapters
      volumes
      synonyms
    }
  }
`;

export class AniListService {
  private async request(query: string, variables: Record<string, any>) {
    try {
      const response = await axios.post(ANILIST_API_URL, {
        query,
        variables,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (response.data.errors) {
        console.error('AniList API errors:', response.data.errors);
        return null;
      }

      return response.data.data;
    } catch (error) {
      console.error('AniList API request failed:', error);
      return null;
    }
  }

  async searchManga(title: string): Promise<AniListManga[]> {
    const data = await this.request(SEARCH_MANGA_QUERY, { search: title });
    
    if (!data || !data.Page || !data.Page.media) {
      return [];
    }

    return data.Page.media.map((media: any) => this.transformMedia(media));
  }

  async getMangaById(id: number): Promise<AniListManga | null> {
    const data = await this.request(GET_MANGA_QUERY, { id });
    
    if (!data || !data.Media) {
      return null;
    }

    return this.transformMedia(data.Media);
  }

  private transformMedia(media: any): AniListManga {
    // Extract author and artist from staff
    let author: string | null = null;
    let artist: string | null = null;

    if (media.staff && media.staff.edges) {
      for (const edge of media.staff.edges) {
        const role = edge.role?.toLowerCase() || '';
        const name = edge.node?.name?.full;
        
        if (name) {
          if (role.includes('story') || role.includes('author')) {
            author = name;
          }
          if (role.includes('art')) {
            artist = name;
          }
        }
      }
    }

    // Map AniList status to our status
    const statusMap: Record<string, string> = {
      'FINISHED': 'completed',
      'RELEASING': 'ongoing',
      'NOT_YET_RELEASED': 'upcoming',
      'CANCELLED': 'cancelled',
      'HIATUS': 'hiatus',
    };

    return {
      id: media.id,
      title: media.title,
      description: media.description,
      coverImage: media.coverImage,
      bannerImage: media.bannerImage,
      author,
      artist,
      status: statusMap[media.status] || 'unknown',
      genres: media.genres || [],
      tags: media.tags || [],
      startDate: media.startDate,
      chapters: media.chapters,
      volumes: media.volumes,
      synonyms: media.synonyms || [],
    };
  }

  // Find the best match based on title similarity
  findBestMatch(title: string, results: AniListManga[]): AniListManga | null {
    if (results.length === 0) return null;

    const normalizedTitle = this.normalizeTitle(title);
    
    let bestMatch: AniListManga | null = null;
    let bestScore = 0;

    for (const manga of results) {
      const titles = [
        manga.title.romaji,
        manga.title.english,
        manga.title.native,
        ...manga.synonyms,
      ].filter(Boolean) as string[];

      for (const t of titles) {
        const score = this.calculateSimilarity(normalizedTitle, this.normalizeTitle(t));
        if (score > bestScore) {
          bestScore = score;
          bestMatch = manga;
        }
      }
    }

    // Only return if similarity is above threshold
    return bestScore > 0.6 ? bestMatch : null;
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            (matrix[i - 1]![j - 1] ?? 0) + 1,
            (matrix[i]![j - 1] ?? 0) + 1,
            (matrix[i - 1]![j] ?? 0) + 1
          );
        }
      }
    }

    return matrix[str2.length]?.[str1.length] ?? 0;
  }
}

export const anilistService = new AniListService();
