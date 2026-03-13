import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  href?: string;
  className?: string;
}

export function StatsCard({ title, value, subtitle, icon, trend, href, className }: StatsCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-body text-muted-foreground">{title}</p>
          <p className="text-3xl font-display font-semibold text-card-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              "text-xs font-medium",
              trend.isPositive ? "text-sage" : "text-destructive"
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% from last week
            </p>
          )}
        </div>
        <div className="w-12 h-12 rounded-xl bg-sage-light flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.02]">
          {icon}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className={cn(
          "group block bg-card rounded-xl p-6 shadow-soft border border-border/50 transition-all duration-200 ease-out hover:shadow-medium hover:border-border/80",
          className
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cn(
      "group bg-card rounded-xl p-6 shadow-soft border border-border/50 transition-all duration-200 ease-out hover:shadow-medium hover:border-border/80",
      className
    )}>
      {content}
    </div>
  );
}
