import {
  Children,
  isValidElement,
  type ReactNode,
  type ComponentProps,
} from "react";
import { CodeBlock } from "@/components/code-block";
import { ProtocolFlow } from "@/components/protocol-flow";

function codeText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child): string => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? codeText(child.props.children)
        : "";
    })
    .join("");
}

/** Preserve the portable Markdown diagram, illustrating it only in the docs UI. */
export function IntroductionCode(props: ComponentProps<"pre">) {
  const text = codeText(props.children);
  if (
    text.includes("schema.prisma + aventara.config.ts") &&
    text.includes("avClient.User.find.many(...)")
  ) {
    return <ProtocolFlow />;
  }
  return <CodeBlock {...props} />;
}
