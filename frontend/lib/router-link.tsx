import type { ComponentProps } from "react";
import { Link as RouterLink } from "react-router-dom";

type RouterLinkProps = ComponentProps<typeof RouterLink>;

export function Link({ href, ...props }: Omit<RouterLinkProps, "to"> & { href: string }) {
  return <RouterLink to={href} {...props} />;
}
