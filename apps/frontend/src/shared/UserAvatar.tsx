import { ReactNode } from "react";
import { useAuth } from "../auth/auth-context";
import type { UserType } from "../auth/auth-types";
import { initialsFromName } from "./avatar-utils";
import { useAvatarBlob } from "./useAvatarBlob";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export type UserAvatarProps = {
  fullName: string;
  role?: UserType | null;
  id?: string | null;
  email?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  authFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  size?: AvatarSize;
  className?: string;
  title?: string;
  asChild?: boolean;
  children?: ReactNode;
};

function sizeClass(size: AvatarSize) {
  return `erp-avatar--${size}`;
}

export { initialsFromName } from "./avatar-utils";

export function UserAvatar({
  fullName,
  avatarUrl,
  authFetch: authFetchProp,
  size = "md",
  className = "",
  title,
  asChild = false
}: UserAvatarProps) {
  const blobUrl = useAvatarBlob(avatarUrl, avatarUrl && authFetchProp ? authFetchProp : undefined);
  const initials = initialsFromName(fullName);
  const hasPhoto = Boolean(blobUrl);
  const label = title ?? fullName;

  const rootClass = ["erp-avatar", sizeClass(size), hasPhoto ? "erp-avatar--photo" : "erp-avatar--initials", className]
    .filter(Boolean)
    .join(" ");

  const content = (
    <span className="erp-avatar-ring" aria-hidden={asChild}>
      <span className="erp-avatar-inner">
        {hasPhoto ? <img src={blobUrl!} alt="" className="erp-avatar-img" /> : <span className="erp-avatar-initials">{initials}</span>}
      </span>
    </span>
  );

  if (asChild) {
    return (
      <span className={rootClass} title={label}>
        {content}
      </span>
    );
  }

  return (
    <span className={rootClass} title={label} role="img" aria-label={label}>
      {content}
    </span>
  );
}

export function CurrentUserAvatar({ size = "md", className = "" }: { size?: AvatarSize; className?: string }) {
  const { user, authFetch } = useAuth();
  if (!user) {
    return (
      <span className={`erp-avatar ${sizeClass(size)} erp-avatar--initials ${className}`}>
        <span className="erp-avatar-ring">
          <span className="erp-avatar-inner">
            <span className="erp-avatar-initials">U</span>
          </span>
        </span>
      </span>
    );
  }

  return (
    <UserAvatar
      fullName={user.fullName}
      role={user.type}
      id={user.id}
      email={user.email}
      username={user.username}
      avatarUrl={user.avatarUrl}
      authFetch={authFetch}
      size={size}
      className={className}
    />
  );
}
