import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { Button } from "./ui/button";

export function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        <Compass className="size-6" />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          That link does not match a screen in Mugiwara. It may have been moved,
          or the URL is incomplete.
        </p>
      </div>
      <Button asChild variant="brand" className="mt-1">
        <Link to="/">
          <Home className="size-4" /> Go to Library
        </Link>
      </Button>
    </div>
  );
}
