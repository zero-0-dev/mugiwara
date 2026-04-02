import type { MangaSource } from './types';

class PluginManager {
  private sources: Map<string, MangaSource> = new Map();
  
  registerSource(source: MangaSource): void {
    this.sources.set(source.id, source);
    console.log(`📚 Registered manga source: ${source.name} (${source.id})`);
  }
  
  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }
  
  getSource(sourceId: string): MangaSource | undefined {
    return this.sources.get(sourceId);
  }
  
  getAllSources(): MangaSource[] {
    return Array.from(this.sources.values());
  }
  
  async searchAllSources(query: string): Promise<Map<string, ReturnType<MangaSource['search']>>> {
    const results = new Map<string, ReturnType<MangaSource['search']>>();
    
    for (const [id, source] of this.sources) {
      results.set(id, source.search(query));
    }
    
    return results;
  }
}

export const pluginManager = new PluginManager();
