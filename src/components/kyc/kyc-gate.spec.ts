import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { KycGateProps } from "@/components/kyc/kyc-gate";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: unknown;
      [key: string]: unknown;
    }) => React.createElement("a", { href, ...rest }, children as never),
  };
});

const { KycGate } = await import("@/components/kyc/kyc-gate");

function render(approved: boolean): string {
  return renderToStaticMarkup(
    createElement(
      KycGate,
      {
        approved,
        href: "/signup/verification",
        label: "Apply",
        description: "Verify first.",
      } as KycGateProps,
      createElement("a", { href: "/tenant/apply" }, "Apply through Vemra"),
    ),
  );
}

describe("KycGate", () => {
  it("renders the original control untouched when approved", () => {
    const html = render(true);

    expect(html).toContain('href="/tenant/apply"');
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("Complete verification");
  });

  it("renders a disabled control and verification link when not approved", () => {
    const html = render(false);

    expect(html).toContain("disabled");
    expect(html).toContain(">Apply<");
    expect(html).toContain("Verify first.");
    expect(html).toContain('href="/signup/verification"');
    expect(html).toContain("Complete verification");
    expect(html).not.toContain('href="/tenant/apply"');
  });
});
