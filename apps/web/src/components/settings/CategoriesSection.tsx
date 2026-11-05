import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
} from "lucide-react";
import type { CategoryWithCount } from "../../api/client";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "../../api/hooks";
import { useToast } from "../Toast";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import {
  DEFAULT_CATEGORY_COLOR,
  categoryTextColor,
  normalizeCategoryColor,
} from "@/lib/category-color";
import { cn } from "@/lib/utils";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function validateName(
  name: string,
  categories: CategoryWithCount[],
  editingId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Category name is required.";

  const duplicate = categories.some(
    (category) =>
      category.id !== editingId &&
      category.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );

  if (duplicate) return "A category with this name already exists.";
  return null;
}

function CategoryColorPreview({
  name,
  color,
}: {
  name: string;
  color: string;
}) {
  const normalized = normalizeCategoryColor(color);
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: normalized,
        color: categoryTextColor(normalized),
      }}
    >
      {name.trim() || "Category preview"}
    </span>
  );
}

export function CategoriesSection() {
  const toast = useToast();
  const {
    data: categories = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryWithCount | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryWithCount | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setColor(DEFAULT_CATEGORY_COLOR);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (category: CategoryWithCount) => {
    setEditing(category);
    setName(category.name);
    setColor(normalizeCategoryColor(category.color));
    setFormError(null);
    setFormOpen(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateName(name, categories, editing?.id);
    if (validation) {
      setFormError(validation);
      return;
    }

    const trimmedName = name.trim();
    const normalizedColor = normalizeCategoryColor(color);

    if (editing) {
      updateCategory.mutate(
        { id: editing.id, name: trimmedName, color: normalizedColor },
        {
          onSuccess: () => {
            toast.success(`Renamed category to "${trimmedName}".`);
            closeForm();
          },
          onError: (err) =>
            setFormError(errorMessage(err, "Failed to update category.")),
        },
      );
      return;
    }

    createCategory.mutate(
      { name: trimmedName, color: normalizedColor },
      {
        onSuccess: () => {
          toast.success(`Created category "${trimmedName}".`);
          closeForm();
        },
        onError: (err) =>
          setFormError(errorMessage(err, "Failed to create category.")),
      },
    );
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);

    setReordering(true);
    try {
      // Persist contiguous positions so later reorders stay predictable even
      // when legacy rows share a sort order.
      for (let position = 0; position < reordered.length; position += 1) {
        const category = reordered[position]!;
        if (category.sortOrder !== position) {
          await updateCategory.mutateAsync({
            id: category.id,
            sortOrder: position,
          });
        }
      }
    } catch (err) {
      toast.error(errorMessage(err, "Failed to reorder categories."));
    } finally {
      setReordering(false);
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteCategory.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`Deleted category "${deleteTarget.name}".`);
        setDeleteTarget(null);
        setDeleteError(null);
      },
      onError: (err) =>
        setDeleteError(errorMessage(err, "Failed to delete category.")),
    });
  };

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Categories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Group manga with your own labels. Categories are separate from
            reading status and never delete manga or chapters.
          </p>
        </div>
        <Button
          variant="brand"
          size="sm"
          onClick={openCreate}
          className="w-full shrink-0 sm:w-auto"
        >
          <Plus className="size-4" />
          New Category
        </Button>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="space-y-3" aria-label="Loading categories">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Skeleton className="size-4 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32 max-w-full" />
                    <Skeleton className="h-3 w-24 max-w-full" />
                  </div>
                </div>
                <Skeleton className="h-8 w-24 shrink-0" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription className="flex flex-col gap-3">
              <span>{errorMessage(error, "Failed to load categories.")}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="w-fit"
              >
                <RefreshCw
                  className={cn("size-4", isFetching && "animate-spin")}
                />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/40 px-4 py-10 text-center">
            <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <Tags className="size-5" />
            </div>
            <p className="mt-3 text-sm font-medium">No categories yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Create a category to start filtering and grouping your library.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={openCreate}
            >
              <Plus className="size-4" />
              New Category
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {categories.map((category, index) => {
              const normalizedColor = normalizeCategoryColor(category.color);
              return (
                <li
                  key={category.id}
                  className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="size-4 shrink-0 rounded-full border border-black/10 shadow-sm"
                      style={{ backgroundColor: normalizedColor }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {category.name}
                        </p>
                        <Badge variant="secondary" className="shrink-0">
                          {category.mangaCount} manga
                        </Badge>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Order {index + 1}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: normalizedColor }}
                            aria-hidden="true"
                          />
                          <span className="font-mono">{normalizedColor}</span>
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleMove(index, -1)}
                      disabled={index === 0 || reordering}
                      aria-label={`Move ${category.name} up`}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleMove(index, 1)}
                      disabled={index === categories.length - 1 || reordering}
                      aria-label={`Move ${category.name} down`}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(category)}
                      aria-label={`Edit ${category.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(category);
                      }}
                      aria-label={`Delete ${category.name}`}
                      className="text-destructive-text hover:text-destructive-text"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-sm:px-4 max-sm:pt-4">
          <DialogHeader className="pr-8">
            <DialogTitle>
              {editing ? "Edit category" : "New category"}
            </DialogTitle>
            <DialogDescription>
              Give the category a name and a color. Names must be unique.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="e.g. Favorites"
                maxLength={60}
                autoFocus
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? "category-form-error" : undefined}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category-color">Color</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="category-color"
                  type="color"
                  value={normalizeCategoryColor(color)}
                  onChange={(event) => setColor(event.target.value)}
                  aria-label="Category color"
                  className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-background p-1"
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {normalizeCategoryColor(color)}
                </span>
                <CategoryColorPreview name={name} color={color} />
              </div>
              <p className="text-xs text-muted-foreground">
                Preview text switches between black and white for contrast. The
                default color is {DEFAULT_CATEGORY_COLOR}.
              </p>
            </div>

            {formError && (
              <Alert variant="destructive" id="category-form-error">
                <AlertCircle className="size-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createCategory.isPending || updateCategory.isPending}
              >
                {createCategory.isPending || updateCategory.isPending
                  ? "Saving..."
                  : editing
                    ? "Save changes"
                    : "Create category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="max-sm:px-4 max-sm:pt-4">
          <DialogHeader className="pr-8">
            <DialogTitle>
              Delete {deleteTarget ? `"${deleteTarget.name}"` : "category"}?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget && deleteTarget.mangaCount > 0
                ? `This removes the category from ${deleteTarget.mangaCount} manga. The manga and their chapters are not deleted.`
                : "This category has no manga assigned. Nothing else is deleted."}
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? "Deleting..." : "Delete category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
