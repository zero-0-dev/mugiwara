import { Plus, X } from "lucide-react";
import {
  useAddMangaToCategory,
  useCategories,
  useMangaCategories,
  useRemoveMangaFromCategory,
} from "../api/hooks";
import { useToast } from "./Toast";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  categoryTextColor,
  normalizeCategoryColor,
} from "@/lib/category-color";
import { cn } from "@/lib/utils";

interface CategoryPickerProps {
  mangaId: string;
}

export function CategoryPicker({ mangaId }: CategoryPickerProps) {
  const toast = useToast();
  const { data: categories = [], isLoading } = useCategories();
  const { data: assigned = [], isLoading: isLoadingAssigned } =
    useMangaCategories(mangaId);
  const addToCategory = useAddMangaToCategory(mangaId);
  const removeFromCategory = useRemoveMangaFromCategory(mangaId);

  const assignedIds = new Set(assigned.map((category) => category.id));
  const available = categories.filter(
    (category) => !assignedIds.has(category.id),
  );
  const busy = addToCategory.isPending || removeFromCategory.isPending;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Categories
      </span>

      {assigned.map((category) => {
        const color = normalizeCategoryColor(category.color);
        return (
          <span
            key={category.id}
            className="inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: color,
              borderColor: color,
              color: categoryTextColor(color),
            }}
          >
            <span className="truncate">{category.name}</span>
            <button
              type="button"
              onClick={() =>
                removeFromCategory.mutate(category.id, {
                  onError: (err) =>
                    toast.error(err.message || "Failed to remove category."),
                })
              }
              disabled={busy}
              className="shrink-0 rounded-full p-0.5 outline-none transition hover:bg-black/20 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              title={`Remove from ${category.name}`}
              aria-label={`Remove from ${category.name}`}
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}

      {!isLoadingAssigned && assigned.length === 0 && categories.length > 0 && (
        <span className="text-xs text-muted-foreground">None yet</span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2"
            disabled={isLoading || isLoadingAssigned}
            aria-label="Assign category"
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          collisionPadding={12}
          className={cn(
            "max-h-[min(60vh,18rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto",
          )}
        >
          <DropdownMenuLabel>Add to category</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {categories.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              No categories yet. Create one in Settings → Categories.
            </div>
          ) : available.length === 0 ? (
            <DropdownMenuItem disabled>
              All categories assigned
            </DropdownMenuItem>
          ) : (
            available.map((category) => {
              const color = normalizeCategoryColor(category.color);
              return (
                <DropdownMenuItem
                  key={category.id}
                  onClick={() =>
                    addToCategory.mutate(category.id, {
                      onError: (err) =>
                        toast.error(err.message || "Failed to add category."),
                    })
                  }
                  disabled={busy}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate">{category.name}</span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
