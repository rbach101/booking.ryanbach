import { Link, useLocation } from "react-router-dom";
import { Home, ArrowLeft, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="font-display text-4xl font-semibold text-foreground mb-2">404</h1>
        <p className="text-lg text-muted-foreground mb-2">Page not found</p>
        <p className="text-sm text-muted-foreground mb-8">
          The page <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{location.pathname}</code> doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="gap-2">
            <Link to="/">
              <Home className="w-4 h-4" />
              Home
            </Link>
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
            Go back
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
