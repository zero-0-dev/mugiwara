import { PluginPackageInfo } from "./types";

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      author?: { name?: string } | string;
      keywords?: string[];
      date?: string;
    };
  }>;
  total: number;
}

export class PluginDiscoveryService {
  private npmRegistryUrl = "https://registry.npmjs.org/-/v1/search";

  async searchPlugins(
    query: string = "",
    type?: "source" | "storage",
  ): Promise<PluginPackageInfo[]> {
    const keyword = type ? `mugiwara-plugin-${type}` : "mugiwara";
    const searchQuery = query ? `${query} ${keyword}` : keyword;

    const url = `${this.npmRegistryUrl}?text=${encodeURIComponent(searchQuery)}&size=50`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`NPM search failed: ${response.statusText}`);
      }

      const data = (await response.json()) as NpmSearchResult;

      return data.objects
        .filter((obj) => this.isValidPluginName(obj.package.name))
        .map((obj) => ({
          name: obj.package.name,
          version: obj.package.version,
          description: obj.package.description,
          author:
            typeof obj.package.author === "string"
              ? obj.package.author
              : obj.package.author?.name,
          keywords: obj.package.keywords,
        }));
    } catch (error) {
      console.error("Failed to search NPM:", error);
      return [];
    }
  }

  async getAvailableSources(): Promise<PluginPackageInfo[]> {
    return this.searchPlugins("", "source");
  }

  async getAvailableStorage(): Promise<PluginPackageInfo[]> {
    return this.searchPlugins("", "storage");
  }

  private isValidPluginName(name: string): boolean {
    return name.startsWith("mugiwara-plugin-");
  }
}
