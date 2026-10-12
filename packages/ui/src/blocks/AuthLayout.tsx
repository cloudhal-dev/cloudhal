import { Surface, Text } from "@cloudflare/kumo";
import type { ReactNode } from "react";

export interface AuthLayoutProps {
  /** 20px brand icon, shown in a tinted tile next to the product name. */
  brand: ReactNode;
  product: string;
  /** Card heading ("Sign in", "Create your account"). */
  title: ReactNode;
  description?: ReactNode;
  /** The form: tabs, fields, a full-width primary button. */
  children: ReactNode;
  /** Under the card: language switch, help links. */
  footer?: ReactNode;
}

/**
 * Sign-in / sign-up / setup screens (DESIGN.md §2e): no sidebar, a centred 400px column on the
 * canvas — brand row, one `Surface` card with the heading and form, a quiet footer.
 */
export function AuthLayout({
  brand,
  product,
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-kumo-canvas px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-kumo-tint text-kumo-brand ring ring-kumo-hairline">
            {brand}
          </span>
          <Text variant="heading" as="span">
            {product}
          </Text>
        </div>
        <Surface className="grid gap-5 rounded-xl px-6 py-5 ring ring-kumo-line">
          <div className="grid gap-1.5">
            <Text variant="heading" size="lg" as="h1">
              {title}
            </Text>
            {description && <Text variant="secondary">{description}</Text>}
          </div>
          {children}
        </Surface>
        {footer && (
          <div className="flex flex-wrap items-center justify-between gap-3">{footer}</div>
        )}
      </div>
    </main>
  );
}
